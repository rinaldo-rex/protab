import type { PersistedState, MigrationBackup } from '../domain/types'
import type { StorageAdapter, MigrationStorageAdapter } from './repository'

export class MemoryStorageAdapter implements StorageAdapter {
  value: unknown | undefined
  writes = 0
  failNextWrite: Error | undefined
  private listeners = new Set<(value: unknown) => void>()

  constructor(initial?: unknown) {
    this.value = initial
  }

  async get(): Promise<unknown | undefined> {
    return this.value === undefined ? undefined : structuredClone(this.value)
  }

  async set(state: PersistedState): Promise<void> {
    if (this.failNextWrite) {
      const error = this.failNextWrite
      this.failNextWrite = undefined
      throw error
    }
    this.value = structuredClone(state)
    this.writes += 1
    this.listeners.forEach((listener) => listener(structuredClone(state)))
  }

  subscribe(listener: (value: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export class MemoryMigrationStorageAdapter implements MigrationStorageAdapter {
  backup: MigrationBackup | undefined
  backupWrites = 0
  failNextBackupWrite: Error | undefined

  constructor(initial?: MigrationBackup) {
    this.backup = initial
  }

  async getMigrationBackup(): Promise<unknown | undefined> {
    return this.backup ? structuredClone(this.backup) : undefined
  }

  async setMigrationBackup(backup: MigrationBackup): Promise<void> {
    if (this.failNextBackupWrite) {
      const error = this.failNextBackupWrite
      this.failNextBackupWrite = undefined
      throw error
    }
    this.backup = structuredClone(backup)
    this.backupWrites += 1
  }
}
