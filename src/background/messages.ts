import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedStateV1 } from '../domain/types'
import type { LiveTabInventory } from '../domain/liveTabs'
import type { PreparedFilingOperation, FilingResult, FilingSummary } from './tabs/filing'

export const MESSAGE_CHANNEL = 'protab'
export const LIVE_TAB_PORT = 'protab-live-tabs'

export type ClientMessage =
  | { channel: typeof MESSAGE_CHANNEL; kind: 'READ_STATE' }
  | { channel: typeof MESSAGE_CHANNEL; kind: 'COMMAND'; command: Command }

export type BackgroundResponse =
  | { ok: true; state: PersistedStateV1; meta?: CommandResultMeta }
  | { ok: false; error: { message: string; code?: string; existingId?: string; storageBlocked?: boolean } }

export const STATE_COMMITTED = 'STATE_COMMITTED'

export interface StateCommittedMessage {
  channel: typeof MESSAGE_CHANNEL
  kind: typeof STATE_COMMITTED
  state: PersistedStateV1
}

export type LiveTabRequest =
  | { kind: 'RETRY_TAB_INVENTORY' }
  | { kind: 'FOCUS_LIVE_TAB'; tabId: number }
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

export type LiveTabMessage =
  | { kind: 'LIVE_TAB_INVENTORY'; inventory: LiveTabInventory }
  | { kind: 'LIVE_TAB_ACTION_ERROR'; message: string; tabId?: number }
  | { kind: 'PROJECT_DELETED'; projectId: string; state: PersistedStateV1 }
  | { kind: 'FILING_PREPARED'; operation: PreparedFilingOperation }
  | { kind: 'FILING_RESULT'; result: FilingResult }
  | { kind: 'FILING_SUMMARY'; summary: FilingSummary }
  | { kind: 'BULK_FILING_PREPARED'; operationId: string; eligible: number; projectName: string }
