import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedStateV1 } from '../domain/types'

export const MESSAGE_CHANNEL = 'protab'

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
