import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedState } from '../domain/types'
import type { LiveTabInventory } from '../domain/liveTabs'
import type { PreparedFilingOperation, FilingResult, FilingSummary } from './tabs/filing'

// Phase 4: Project activation and bulk operations
export interface PreparedActivationOperation {
  operationId: string
  projectId: string
  projectName: string
  otherProjectTabs: number
  driftedTabs: Array<{ tabId: number; savedUrl: string; currentUrl: string }>
  unassignedCount: number
}

export interface ActivationSummary {
  projectId: string
  total: number
  closed: number
  requested: number
  kept: number
  surviving: number
  skipped: Array<{ tabId: number; reason: string }>
  failed: Array<{ tabId: number; message: string }>
  unassignedCount: number
}

export interface CloseAllSummary {
  total: number
  closed: number
  requested: number
  kept: number
  surviving: number
  skipped: Array<{ tabId: number; reason: string }>
  failed: Array<{ tabId: number; message: string }>
}

export interface OpenAllSummary {
  total: number
  focused: number
  created: number
  failed: Array<{ savedUrlId: string; message: string }>
}

export interface DriftTabReview {
  tabId: number
  savedUrl: string
  currentUrl: string
  keep: boolean
}

export const MESSAGE_CHANNEL = 'protab'
export const LIVE_TAB_PORT = 'protab-live-tabs'

export type ClientMessage =
  | { channel: typeof MESSAGE_CHANNEL; kind: 'READ_STATE' }
  | { channel: typeof MESSAGE_CHANNEL; kind: 'COMMAND'; command: Command }

export type BackgroundResponse =
  | { ok: true; state: PersistedState; meta?: CommandResultMeta }
  | { ok: false; error: { message: string; code?: string; existingId?: string; storageBlocked?: boolean } }

export const STATE_COMMITTED = 'STATE_COMMITTED'

export interface StateCommittedMessage {
  channel: typeof MESSAGE_CHANNEL
  kind: typeof STATE_COMMITTED
  state: PersistedState
}

export type LiveTabRequest =
  | { kind: 'RETRY_TAB_INVENTORY' }
  | { kind: 'FOCUS_LIVE_TAB'; tabId: number }
  | { kind: 'CLOSE_LIVE_TAB'; tabId: number }
  | { kind: 'ASSIGN_LIVE_TAB'; tabId: number; projectId: string; savedUrlId: string }
  | { kind: 'OPEN_SAVED_URL'; projectId: string; savedUrlId: string }
  | { kind: 'OPEN_SAVED_URL_COPY'; projectId: string; savedUrlId: string }
  | { kind: 'DELETE_PROJECT_WITH_LIVE_TABS'; projectId: string }
  | { kind: 'PREPARE_FILE_LIVE_TAB'; tabId: number; projectId: string }
  | { kind: 'CONFIRM_FILE_LIVE_TAB'; operationId: string }
  | { kind: 'CANCEL_FILE_OPERATION'; operationId: string }
  | { kind: 'RETRY_FILE_OPERATION'; operationId: string }
  | { kind: 'PREPARE_FILE_ALL_UNASSIGNED'; projectId: string }
  | { kind: 'CONFIRM_FILE_ALL_UNASSIGNED'; operationId: string; projectId: string }
  // Phase 4: Project activation
  | { kind: 'PREPARE_ACTIVATE_PROJECT'; projectId: string }
  | { kind: 'CONFIRM_ACTIVATE_PROJECT'; operationId: string }
  | { kind: 'CANCEL_ACTIVATE_PROJECT'; operationId: string }
  // Phase 4: Open all
  | { kind: 'OPEN_ALL_PROJECT_URLS'; projectId: string }
  // Phase 4: Close all
  | { kind: 'PREPARE_CLOSE_ALL_PROJECT_TABS'; projectId: string }
  | { kind: 'CONFIRM_CLOSE_ALL_PROJECT_TABS'; operationId: string }
  | { kind: 'CANCEL_CLOSE_ALL_PROJECT_TABS'; operationId: string }
  // Phase 4A: Archive
  | { kind: 'ARCHIVE_SAVED_URL'; projectId: string; savedUrlId: string }
  | { kind: 'UNARCHIVE_SAVED_URL'; projectId: string; savedUrlId: string }
  // Phase 4B: Quick capture
  | { kind: 'QUICK_CAPTURE_TAB'; projectId: string; note: string; tags: string[] }
  // Phase 4B: Silent file (no confirmation)
  | { kind: 'SILENT_FILE_TAB'; tabId: number; projectId: string }
  // Phase 4D: Silent file and archive (no confirmation)
  | { kind: 'SILENT_FILE_AND_ARCHIVE_TAB'; tabId: number; projectId: string }
  // Phase 4D: Migration backup
  | { kind: 'CHECK_MIGRATION_BACKUP' }
  | { kind: 'EXPORT_MIGRATION_BACKUP' }
  | { kind: 'RESTORE_MIGRATION_BACKUP' }
  // Phase 4D: Protected tabs
  | { kind: 'TOGGLE_LIVE_TAB_PIN'; tabId: number }
  // Archive project
  | { kind: 'ARCHIVE_PROJECT'; projectId: string; archived: boolean }
  // Phase 4D: Legacy data import
  | { kind: 'CHECK_LEGACY_DATA' }
  | { kind: 'IMPORT_LEGACY_PROJECTS'; projectNames: string[] }
  | { kind: 'DISMISS_LEGACY_DATA' }

export type LiveTabMessage =
  | { kind: 'LIVE_TAB_INVENTORY'; inventory: LiveTabInventory }
  | { kind: 'LIVE_TAB_ACTION_ERROR'; message: string; tabId?: number }
  | { kind: 'PROJECT_DELETED'; projectId: string; state: PersistedState }
  | { kind: 'FILING_PREPARED'; operation: PreparedFilingOperation }
  | { kind: 'FILING_RESULT'; result: FilingResult }
  | { kind: 'FILING_SUMMARY'; summary: FilingSummary }
  | { kind: 'BULK_FILING_PREPARED'; operationId: string; eligible: number; projectName: string }
  // Phase 4: Activation
  | { kind: 'ACTIVATION_PREPARED'; operation: PreparedActivationOperation }
  | { kind: 'ACTIVATION_SUMMARY'; summary: ActivationSummary }
  // Phase 4: Open all
  | { kind: 'OPEN_ALL_SUMMARY'; summary: OpenAllSummary }
  // Phase 4: Close all
  | { kind: 'CLOSE_ALL_PREPARED'; operationId: string; projectName: string; total: number; driftedTabs: Array<{ tabId: number; savedUrl: string; currentUrl: string }> }
  | { kind: 'CLOSE_ALL_SUMMARY'; summary: CloseAllSummary }
  // Phase 4A: Archive
  | { kind: 'ARCHIVE_RESULT'; projectId: string; savedUrlId: string; archived: boolean }
  | { kind: 'ARCHIVE_PROJECT_RESULT'; projectId: string; archived: boolean }
  // Phase 4B: Quick capture
  | { kind: 'QUICK_CAPTURE_RESULT'; success: boolean; projectName: string; error?: string }
  // Phase 4D: Migration backup
  | { kind: 'MIGRATION_BACKUP_STATUS'; available: boolean; fromSchemaVersion?: number; toSchemaVersion?: number; createdAt?: number }
  | { kind: 'MIGRATION_BACKUP_EXPORTED'; json: string }
  | { kind: 'MIGRATION_BACKUP_RESTORED'; success: boolean; error?: string }
  | { kind: 'MIGRATION_COMPLETED'; fromSchemaVersion: number; toSchemaVersion: number }
  // Phase 4D: Legacy data
  | { kind: 'LEGACY_DATA_STATUS'; available: boolean; schemaVersion?: number; projectCount?: number; projects?: Array<{ name: string; urlCount: number; archivedCount: number }> }
  | { kind: 'LEGACY_DATA_IMPORTED'; success: boolean; importedCount?: number; error?: string }
