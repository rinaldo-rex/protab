import { emptyState, type PersistedState, type MigrationBackup } from '../domain/types'
import { parsePersistedStateWithMetadata } from './schema'
import type { ProtabAnalytics } from '../domain/analytics'
import { emptyAnalytics } from '../domain/analytics'

export const STORAGE_KEY = 'protab.state'
export const MIGRATION_BACKUP_KEY = 'protab.state.migrationBackup.latest'
export const ANALYTICS_KEY = 'protab.analytics'

export interface LoadedState {
  state: PersistedState
  migration?: {
    fromSchemaVersion: number
    toSchemaVersion: number
    backupAvailable: boolean
  }
  legacyData?: LegacyDataInfo
}

export interface LegacyDataInfo {
  available: boolean
  schemaVersion: number
  projectCount: number
  projects: Array<{ name: string; urlCount: number; archivedCount: number }>
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

export interface AnalyticsStorageAdapter {
  getAnalytics(): Promise<ProtabAnalytics>
  setAnalytics(analytics: ProtabAnalytics): Promise<void>
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

export class ChromeAnalyticsStorageAdapter implements AnalyticsStorageAdapter {
  async getAnalytics(): Promise<ProtabAnalytics> {
    const result = await chrome.storage.local.get(ANALYTICS_KEY)
    const raw = result[ANALYTICS_KEY]
    if (!raw || typeof raw !== 'object') return emptyAnalytics()
    return {
      totalTabsFiled: typeof raw.totalTabsFiled === 'number' ? raw.totalTabsFiled : 0,
      totalUrlsArchived: typeof raw.totalUrlsArchived === 'number' ? raw.totalUrlsArchived : 0,
      lastAction: raw.lastAction && typeof raw.lastAction === 'object' ? {
        type: raw.lastAction.type,
        tabsBefore: raw.lastAction.tabsBefore,
        tabsAfter: raw.lastAction.tabsAfter,
        timestamp: raw.lastAction.timestamp,
      } : undefined,
      dailyFocus: raw.dailyFocus && typeof raw.dailyFocus === 'object' ? raw.dailyFocus : {},
    }
  }

  async setAnalytics(analytics: ProtabAnalytics): Promise<void> {
    await chrome.storage.local.set({ [ANALYTICS_KEY]: analytics })
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

  // Old schema detected — store as legacy data instead of auto-migrating
  const legacyInfo = extractLegacyDataInfo(raw)

  if (!migrationStorage) {
    throw new Error('Legacy data detected but no migration storage adapter provided.')
  }

  // Store legacy raw data for later selective import
  await migrationStorage.setMigrationBackup({
    schemaVersion: 1,
    createdAt: Date.now(),
    fromSchemaVersion: parsed.originalSchemaVersion,
    toSchemaVersion: parsed.currentSchemaVersion,
    rawState: raw,
  })

  // Return empty state — the user will import selectively
  return {
    state: emptyState(),
    legacyData: legacyInfo,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extractLegacyDataInfo(raw: unknown): LegacyDataInfo {
  if (!isRecord(raw) || !Array.isArray(raw.projects)) {
    return { available: false, schemaVersion: 0, projectCount: 0, projects: [] }
  }
  const projects = raw.projects.map((p: unknown) => {
    if (!isRecord(p)) return { name: 'Unknown', urlCount: 0, archivedCount: 0 }
    const savedUrls = Array.isArray(p.savedUrls) ? p.savedUrls : []
    return {
      name: typeof p.name === 'string' ? p.name : 'Unknown',
      urlCount: savedUrls.length,
      archivedCount: savedUrls.filter((u: unknown) => isRecord(u) && u.archivedAt != null).length,
    }
  })
  return {
    available: true,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0,
    projectCount: projects.length,
    projects,
  }
}

export async function readLegacyData(
  migrationStorage: MigrationStorageAdapter,
): Promise<unknown | undefined> {
  const backup = await migrationStorage.getMigrationBackup()
  return backup ? (backup as MigrationBackup).rawState : undefined
}

export async function importLegacyProjects(
  storage: StorageAdapter,
  migrationStorage: MigrationStorageAdapter,
  selectedProjectNames: string[],
): Promise<PersistedState> {
  const backup = await migrationStorage.getMigrationBackup()
  if (!backup) throw new Error('No legacy data available.')
  const raw = (backup as MigrationBackup).rawState

  // Migrate the raw data through the pipeline
  const parsed = parsePersistedStateWithMetadata(raw)
  const migratedState = parsed.state

  // Filter to selected projects only
  const selectedProjects = migratedState.projects.filter((p) =>
    selectedProjectNames.includes(p.name),
  )

  // Read current state and merge
  const currentRaw = await storage.get()
  let currentState: PersistedState
  if (currentRaw === undefined) {
    currentState = emptyState()
  } else {
    currentState = parsePersistedStateWithMetadata(currentRaw).state
  }

  // Merge: add selected projects, skip duplicates by name
  const existingNames = new Set(currentState.projects.map((p) => p.name))
  for (const project of selectedProjects) {
    if (!existingNames.has(project.name)) {
      currentState.projects.push(project)
    }
  }

  await storage.set(currentState)
  return currentState
}

export async function loadAnalytics(analyticsStorage: AnalyticsStorageAdapter): Promise<ProtabAnalytics> {
  return analyticsStorage.getAnalytics()
}

export async function recordAnalyticsEvent(
  analyticsStorage: AnalyticsStorageAdapter,
  event: { tabsFiled?: number; urlsArchived?: number; action?: ProtabAnalytics['lastAction'] },
): Promise<ProtabAnalytics> {
  const current = await analyticsStorage.getAnalytics()
  const updated: ProtabAnalytics = {
    totalTabsFiled: current.totalTabsFiled + (event.tabsFiled ?? 0),
    totalUrlsArchived: current.totalUrlsArchived + (event.urlsArchived ?? 0),
    lastAction: event.action ?? current.lastAction,
    dailyFocus: current.dailyFocus,
  }
  await analyticsStorage.setAnalytics(updated)
  return updated
}

export async function recordFocusSample(
  analyticsStorage: AnalyticsStorageAdapter,
  tabCount: number,
): Promise<ProtabAnalytics> {
  const current = await analyticsStorage.getAnalytics()
  const { recordFocusSample: record } = await import('../domain/analytics')
  const updated = record(current, tabCount)
  await analyticsStorage.setAnalytics(updated)
  return updated
}
