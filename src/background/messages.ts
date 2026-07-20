import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedStateV1 } from '../domain/types'
import type { LiveTabInventory } from '../domain/liveTabs'

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

export type LiveTabMessage =
  | { kind: 'LIVE_TAB_INVENTORY'; inventory: LiveTabInventory }
  | { kind: 'LIVE_TAB_ACTION_ERROR'; message: string; tabId?: number }
