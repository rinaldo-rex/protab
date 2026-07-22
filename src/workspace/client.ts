import type { Command, CommandResultMeta } from '../domain/commands'
import type { PersistedState } from '../domain/types'
import { MESSAGE_CHANNEL, STATE_COMMITTED, type BackgroundResponse, type ClientMessage } from '../background/messages'

export interface WorkspaceClient {
  read(): Promise<PersistedState>
  execute(command: Command): Promise<{ state: PersistedState; meta: CommandResultMeta }>
  subscribe(listener: (state: PersistedState) => void): () => void
}

export class ClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly existingId?: string,
    public readonly storageBlocked = false,
  ) {
    super(message)
    this.name = 'ClientError'
  }
}

async function send(message: ClientMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>
}

export class ChromeWorkspaceClient implements WorkspaceClient {
  async read(): Promise<PersistedState> {
    const response = await send({ channel: MESSAGE_CHANNEL, kind: 'READ_STATE' })
    if (!response.ok) throw new ClientError(response.error.message, response.error.code, response.error.existingId, response.error.storageBlocked)
    return response.state
  }

  async execute(command: Command): Promise<{ state: PersistedState; meta: CommandResultMeta }> {
    const response = await send({ channel: MESSAGE_CHANNEL, kind: 'COMMAND', command })
    if (!response.ok) throw new ClientError(response.error.message, response.error.code, response.error.existingId, response.error.storageBlocked)
    if (!response.meta) throw new ClientError('The background service returned no command result.')
    return { state: response.state, meta: response.meta }
  }

  subscribe(listener: (state: PersistedState) => void): () => void {
    const onMessage = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'channel' in message && 'kind' in message && message.channel === MESSAGE_CHANNEL && message.kind === STATE_COMMITTED && 'state' in message) {
        listener(message.state as PersistedState)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }
}
