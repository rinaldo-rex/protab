import { describe, expect, it } from 'vitest'
import { CommandQueue } from './commandQueue'
import { MemoryStorageAdapter, MemoryMigrationStorageAdapter } from './memoryStorage'
import { loadState, loadStateWithMetadata, readMigrationBackup, restoreMigrationBackup, exportMigrationBackup } from './repository'
import { parsePersistedStateWithMetadata } from './schema'

const valid = {
  schemaVersion: 2 as const,
  projects: [{ id: 'p1', name: 'Research', savedUrls: [] }],
}

const validV1 = {
  schemaVersion: 1 as const,
  projects: [{ id: 'p1', name: 'Research', savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'automatic' as const, tags: [], notes: '' }] }],
}

describe('versioned storage', () => {
  it('initializes absent storage without writing', async () => {
    const storage = new MemoryStorageAdapter()
    await expect(loadState(storage)).resolves.toEqual({ schemaVersion: 2, projects: [] })
    expect(storage.writes).toBe(0)
  })

  it('loads a valid V2 value as a clone', async () => {
    const storage = new MemoryStorageAdapter(valid)
    const loaded = await loadState(storage)
    expect(loaded).toEqual(valid)
    expect(loaded).not.toBe(valid)
  })

  it('stores V1 data as legacy instead of auto-migrating', async () => {
    const storage = new MemoryStorageAdapter(validV1)
    const migrationStorage = new MemoryMigrationStorageAdapter()
    const result = await loadStateWithMetadata(storage, migrationStorage)
    // Should return empty state with legacy data info
    expect(result.state.schemaVersion).toBe(2)
    expect(result.state.projects).toEqual([])
    expect(result.legacyData).toBeDefined()
    expect(result.legacyData!.available).toBe(true)
    expect(result.legacyData!.schemaVersion).toBe(1)
    expect(result.legacyData!.projectCount).toBe(1)
    expect(result.legacyData!.projects[0].name).toBe('Research')
    expect(result.legacyData!.projects[0].urlCount).toBe(1)
  })

  it('rejects invalid and unsupported values without touching raw storage', async () => {
    const invalid = { schemaVersion: 1, projects: [{ id: 'p1' }] }
    const invalidStorage = new MemoryStorageAdapter(invalid)
    await expect(loadState(invalidStorage)).rejects.toMatchObject({ kind: 'invalid' })
    expect(invalidStorage.value).toEqual(invalid)
    expect(invalidStorage.writes).toBe(0)

    const future = { schemaVersion: 3, projects: [] }
    const futureStorage = new MemoryStorageAdapter(future)
    await expect(loadState(futureStorage)).rejects.toMatchObject({ kind: 'unsupported-version' })
    expect(futureStorage.value).toEqual(future)
  })

  it('does not replace committed state when a write fails', async () => {
    const storage = new MemoryStorageAdapter(valid)
    storage.failNextWrite = new Error('Quota exceeded')
    const queue = new CommandQueue(storage, () => 'p2')
    await expect(queue.execute({ type: 'CREATE_PROJECT', name: 'Second' })).rejects.toThrow('Quota exceeded')
    await expect(queue.read()).resolves.toEqual(valid)
  })

  it('serializes overlapping clients against latest committed state', async () => {
    const storage = new MemoryStorageAdapter()
    const queue = new CommandQueue(storage, (() => {
      const ids = ['p1', 'p2']
      return () => ids.shift()!
    })())
    const one = queue.execute({ type: 'CREATE_PROJECT', name: 'One' })
    const two = queue.execute({ type: 'CREATE_PROJECT', name: 'Two' })
    await Promise.all([one, two])
    await expect(queue.read()).resolves.toMatchObject({
      projects: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    })
  })
})

describe('parsePersistedStateWithMetadata', () => {
  it('returns migrated: false for current schema', () => {
    const result = parsePersistedStateWithMetadata(valid)
    expect(result.migrated).toBe(false)
    expect(result.originalSchemaVersion).toBe(2)
    expect(result.currentSchemaVersion).toBe(2)
    expect(result.state).toEqual(valid)
  })

  it('returns migrated: true for V1 schema', () => {
    const result = parsePersistedStateWithMetadata(validV1)
    expect(result.migrated).toBe(true)
    expect(result.originalSchemaVersion).toBe(1)
    expect(result.currentSchemaVersion).toBe(2)
    expect(result.state.schemaVersion).toBe(2)
    expect(result.state.projects[0].savedUrls[0]).toMatchObject({ archivedAt: null })
  })

  it('throws invalid for missing schema version', () => {
    expect(() => parsePersistedStateWithMetadata({ projects: [] })).toThrow()
  })

  it('throws unsupported-version for future schema', () => {
    expect(() => parsePersistedStateWithMetadata({ schemaVersion: 99, projects: [] })).toThrow()
  })
})

describe('write-through migration', () => {
  it('stores V1 data as legacy and creates backup', async () => {
    const storage = new MemoryStorageAdapter(validV1)
    const migrationStorage = new MemoryMigrationStorageAdapter()

    const result = await loadStateWithMetadata(storage, migrationStorage)

    // Returns empty state with legacy data info
    expect(result.state.schemaVersion).toBe(2)
    expect(result.state.projects).toEqual([])
    expect(result.legacyData).toBeDefined()
    expect(result.legacyData!.available).toBe(true)
    expect(result.legacyData!.schemaVersion).toBe(1)
    expect(result.migration).toBeUndefined()

    // State was NOT auto-migrated (empty state returned)
    expect(storage.writes).toBe(0)

    // Backup was created for later import
    expect(migrationStorage.backupWrites).toBe(1)
    expect(migrationStorage.backup).toBeDefined()
    expect(migrationStorage.backup!.rawState).toEqual(validV1)
    expect(migrationStorage.backup!.fromSchemaVersion).toBe(1)
    expect(migrationStorage.backup!.toSchemaVersion).toBe(2)
  })

  it('does not store legacy data when backup write fails', async () => {
    const storage = new MemoryStorageAdapter(validV1)
    const migrationStorage = new MemoryMigrationStorageAdapter()
    migrationStorage.failNextBackupWrite = new Error('Storage quota exceeded')

    await expect(loadStateWithMetadata(storage, migrationStorage)).rejects.toThrow('Storage quota exceeded')

    // State should NOT have been written
    expect(storage.writes).toBe(0)
  })

  it('does not create backup or write for current schema', async () => {
    const storage = new MemoryStorageAdapter(valid)
    const migrationStorage = new MemoryMigrationStorageAdapter()

    const result = await loadStateWithMetadata(storage, migrationStorage)

    expect(result.migration).toBeUndefined()
    expect(storage.writes).toBe(0)
    expect(migrationStorage.backupWrites).toBe(0)
  })

  it('returns empty state for absent storage', async () => {
    const storage = new MemoryStorageAdapter()
    const migrationStorage = new MemoryMigrationStorageAdapter()

    const result = await loadStateWithMetadata(storage, migrationStorage)

    expect(result.state).toEqual({ schemaVersion: 2, projects: [] })
    expect(result.migration).toBeUndefined()
    expect(storage.writes).toBe(0)
  })

  it('throws for future unsupported schema without writing', async () => {
    const future = { schemaVersion: 3, projects: [] }
    const storage = new MemoryStorageAdapter(future)
    const migrationStorage = new MemoryMigrationStorageAdapter()

    await expect(loadStateWithMetadata(storage, migrationStorage)).rejects.toMatchObject({ kind: 'unsupported-version' })
    expect(storage.writes).toBe(0)
    expect(migrationStorage.backupWrites).toBe(0)
  })

  it('throws for invalid data without writing', async () => {
    const invalid = { schemaVersion: 1, projects: 'not-an-array' }
    const storage = new MemoryStorageAdapter(invalid)
    const migrationStorage = new MemoryMigrationStorageAdapter()

    await expect(loadStateWithMetadata(storage, migrationStorage)).rejects.toMatchObject({ kind: 'invalid' })
    expect(storage.writes).toBe(0)
    expect(migrationStorage.backupWrites).toBe(0)
  })

  it('throws when migration storage is not provided for legacy data', async () => {
    const storage = new MemoryStorageAdapter(validV1)

    await expect(loadStateWithMetadata(storage)).rejects.toThrow('Legacy data detected but no migration storage adapter provided.')
  })
})

describe('migration backup recovery', () => {
  it('reads a valid backup', async () => {
    const migrationStorage = new MemoryMigrationStorageAdapter({
      schemaVersion: 1,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    })

    const backup = await readMigrationBackup(migrationStorage)
    expect(backup).toBeDefined()
    expect(backup!.rawState).toEqual(validV1)
  })

  it('returns undefined for missing backup', async () => {
    const migrationStorage = new MemoryMigrationStorageAdapter()
    const backup = await readMigrationBackup(migrationStorage)
    expect(backup).toBeUndefined()
  })

  it('returns undefined for invalid backup shape', async () => {
    const migrationStorage = new MemoryMigrationStorageAdapter({ invalid: true } as unknown as import('../domain/types').MigrationBackup)
    const backup = await readMigrationBackup(migrationStorage)
    expect(backup).toBeUndefined()
  })

  it('exports backup as JSON string', async () => {
    const migrationStorage = new MemoryMigrationStorageAdapter({
      schemaVersion: 1,
      createdAt: 12345,
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    })

    const json = await exportMigrationBackup(migrationStorage)
    const parsed = JSON.parse(json)
    expect(parsed.fromSchemaVersion).toBe(1)
    expect(parsed.rawState).toEqual(validV1)
  })

  it('throws export when no backup exists', async () => {
    const migrationStorage = new MemoryMigrationStorageAdapter()
    await expect(exportMigrationBackup(migrationStorage)).rejects.toThrow('No migration backup available.')
  })

  it('restores backup by parsing through current pipeline', async () => {
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    }
    const storage = new MemoryStorageAdapter(valid)
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    const result = await restoreMigrationBackup(storage, migrationStorage)

    expect(result.state.schemaVersion).toBe(2)
    expect(result.state.projects[0].savedUrls[0].archivedAt).toBeNull()
    expect(storage.writes).toBe(1)
  })

  it('throws restore when no backup exists', async () => {
    const storage = new MemoryStorageAdapter(valid)
    const migrationStorage = new MemoryMigrationStorageAdapter()

    await expect(restoreMigrationBackup(storage, migrationStorage)).rejects.toThrow('No migration backup available.')
  })

  it('throws restore when backup raw state is invalid', async () => {
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: { schemaVersion: 1, projects: 'invalid' },
    }
    const storage = new MemoryStorageAdapter(valid)
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    await expect(restoreMigrationBackup(storage, migrationStorage)).rejects.toMatchObject({ kind: 'invalid' })
    expect(storage.writes).toBe(0)
  })

  it('throws restore when backup raw state is future version', async () => {
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: { schemaVersion: 99, projects: [] },
    }
    const storage = new MemoryStorageAdapter(valid)
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    await expect(restoreMigrationBackup(storage, migrationStorage)).rejects.toMatchObject({ kind: 'unsupported-version' })
    expect(storage.writes).toBe(0)
  })
})

describe('legacy data extraction and import', () => {
  it('extracts legacy data info from V1 raw state', async () => {
    const { extractLegacyDataInfo } = await import('./repository')
    const info = extractLegacyDataInfo(validV1)
    expect(info.available).toBe(true)
    expect(info.schemaVersion).toBe(1)
    expect(info.projectCount).toBe(1)
    expect(info.projects[0].name).toBe('Research')
    expect(info.projects[0].urlCount).toBe(1)
    expect(info.projects[0].archivedCount).toBe(0)
  })

  it('returns unavailable for invalid raw state', async () => {
    const { extractLegacyDataInfo } = await import('./repository')
    const info = extractLegacyDataInfo(null)
    expect(info.available).toBe(false)
  })

  it('imports selected legacy projects from backup', async () => {
    const { importLegacyProjects } = await import('./repository')
    const storage = new MemoryStorageAdapter()
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    }
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    // Import
    const result = await importLegacyProjects(storage, migrationStorage, ['Research'])
    expect(result.schemaVersion).toBe(2)
    expect(result.projects.length).toBe(1)
    expect(result.projects[0].name).toBe('Research')
    expect(result.projects[0].savedUrls[0].archivedAt).toBe(null)
  })

  it('skips projects with duplicate names', async () => {
    const { importLegacyProjects } = await import('./repository')
    const existingState = {
      schemaVersion: 2 as const,
      projects: [{ id: 'p1', name: 'Research', savedUrls: [] }],
    }
    const storage = new MemoryStorageAdapter(existingState)
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    }
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    const result = await importLegacyProjects(storage, migrationStorage, ['Research'])
    expect(result.projects.length).toBe(1)
    expect(result.projects[0].savedUrls).toEqual([]) // Existing empty project, not replaced
  })

  it('merges with existing projects', async () => {
    const { importLegacyProjects } = await import('./repository')
    const existingState = {
      schemaVersion: 2 as const,
      projects: [{ id: 'p1', name: 'Existing', savedUrls: [] }],
    }
    const storage = new MemoryStorageAdapter(existingState)
    const backup = {
      schemaVersion: 1 as const,
      createdAt: Date.now(),
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      rawState: validV1,
    }
    const migrationStorage = new MemoryMigrationStorageAdapter(backup)

    const result = await importLegacyProjects(storage, migrationStorage, ['Research'])
    expect(result.projects.length).toBe(2)
    expect(result.projects[0].name).toBe('Existing')
    expect(result.projects[1].name).toBe('Research')
  })

  it('throws when no legacy data is available', async () => {
    const { importLegacyProjects } = await import('./repository')
    const storage = new MemoryStorageAdapter()
    const migrationStorage = new MemoryMigrationStorageAdapter()

    await expect(importLegacyProjects(storage, migrationStorage, ['Research'])).rejects.toThrow('No legacy data available.')
  })
})
