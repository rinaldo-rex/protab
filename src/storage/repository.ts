import { emptyState, type PersistedState, type MigrationBackup } from '../domain/types'
import { parsePersistedStateWithMetadata } from './schema'

export const STORAGE_KEY = 'protab.state'
export const MIGRATION_BACKUP_KEY = 'protab.state.migrationBackup.latest'

export interface LoadedState {
  state: PersistedState
  migration?: {
    fromSchemaVersion: number
    toSchemaVersion: number
    backupAvailable: boolean
  }
}

export interface StorageAdapter {
  get(): Promise<unknown | undefined>
  set(state: PersistedState): Promise<void>
  subscribe?(listener: (value: unknown) => void): () => void
}

export interface MigrationStorageAdapter {
  getMigrationBackup(): Promise<unknown | undefined>
  setMigrationBackup(backup: MigrationBackup): Promise<void>
}

export class ChromeStorageAdapter implements StorageAdapter {
  async get(): Promise<unknown | undefined> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY]
  }

  async set(state: PersistedState): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: state })
  }

  subscribe(listener: (value: unknown) => void): () => void {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEY]?.newValue !== undefined) listener(changes[STORAGE_KEY].newValue)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }
}

export class ChromeMigrationStorageAdapter implements MigrationStorageAdapter {
  async getMigrationBackup(): Promise<unknown | undefined> {
    const result = await chrome.storage.local.get(MIGRATION_BACKUP_KEY)
    return result[MIGRATION_BACKUP_KEY]
  }

  async setMigrationBackup(backup: MigrationBackup): Promise<void> {
    await chrome.storage.local.set({ [MIGRATION_BACKUP_KEY]: backup })
  }
}

export async function loadState(storage: StorageAdapter): Promise<PersistedState> {
  const result = await loadStateWithMetadata(storage)
  return result.state
}

export async function loadStateWithMetadata(
  storage: StorageAdapter,
  migrationStorage?: MigrationStorageAdapter,
): Promise<LoadedState> {
  const raw = await storage.get()
  if (raw === undefined) {
    return { state: emptyState() }
  }

  const parsed = parsePersistedStateWithMetadata(raw)

  if (!parsed.migrated) {
    return { state: parsed.state }
  }

  // Migration needed — write-through with backup
  if (!migrationStorage) {
    throw new Error('Migration required but no migration storage adapter provided.')
  }

  // Step 1: Create backup of pre-migration raw data
  const backup: MigrationBackup = {
    schemaVersion: 1,
    createdAt: Date.now(),
    fromSchemaVersion: parsed.originalSchemaVersion,
    toSchemaVersion: parsed.currentSchemaVersion,
    rawState: raw,
  }

  // Step 2: Write backup first — if this fails, don't replace state
  await migrationStorage.setMigrationBackup(backup)

  // Step 3: Write migrated state
  await storage.set(parsed.state)

  return {
    state: parsed.state,
    migration: {
      fromSchemaVersion: parsed.originalSchemaVersion,
      toSchemaVersion: parsed.currentSchemaVersion,
      backupAvailable: true,
    },
  }
}

export async function readMigrationBackup(
  migrationStorage: MigrationStorageAdapter,
): Promise<MigrationBackup | undefined> {
  const raw = await migrationStorage.getMigrationBackup()
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Partial<MigrationBackup>
  if (
    obj.schemaVersion !== 1 ||
    typeof obj.createdAt !== 'number' ||
    typeof obj.fromSchemaVersion !== 'number' ||
    typeof obj.toSchemaVersion !== 'number' ||
    obj.rawState === undefined
  ) {
    return undefined
  }
  return structuredClone(obj) as MigrationBackup
}

export async function exportMigrationBackup(
  migrationStorage: MigrationStorageAdapter,
): Promise<string> {
  const backup = await readMigrationBackup(migrationStorage)
  if (!backup) throw new Error('No migration backup available.')
  return JSON.stringify(backup, null, 2)
}

export async function restoreMigrationBackup(
  storage: StorageAdapter,
  migrationStorage: MigrationStorageAdapter,
): Promise<LoadedState> {
  const backup = await readMigrationBackup(migrationStorage)
  if (!backup) throw new Error('No migration backup available.')

  // Parse/migrate the backup raw state through the current pipeline
  const parsed = parsePersistedStateWithMetadata(backup.rawState)

  // Write the restored state
  await storage.set(parsed.state)

  return {
    state: parsed.state,
    migration: parsed.migrated
      ? {
          fromSchemaVersion: parsed.originalSchemaVersion,
          toSchemaVersion: parsed.currentSchemaVersion,
          backupAvailable: true,
        }
      : undefined,
  }
}
