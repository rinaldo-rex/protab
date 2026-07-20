import { DomainError } from '../domain/validation'
import { StorageDataError } from '../storage/schema'
import { ChromeStorageAdapter } from '../storage/repository'
import { CommandQueue } from '../storage/commandQueue'
import { MESSAGE_CHANNEL, STATE_COMMITTED, type BackgroundResponse, type ClientMessage, type StateCommittedMessage } from './messages'
import { ChromeToolbarAdapter, serializedToolbarHandler } from './toolbar'

const queue = new CommandQueue(new ChromeStorageAdapter())

chrome.action.onClicked.addListener(serializedToolbarHandler(new ChromeToolbarAdapter()))

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (response: BackgroundResponse) => void) => {
  const request = message as Partial<ClientMessage>
  if (request.channel !== MESSAGE_CHANNEL) return false

  const operation = request.kind === 'READ_STATE'
    ? queue.read().then((state): BackgroundResponse => ({ ok: true, state }))
    : request.kind === 'COMMAND' && request.command
      ? queue.execute(request.command).then(async ({ state, meta }): Promise<BackgroundResponse> => {
          const committed: StateCommittedMessage = { channel: MESSAGE_CHANNEL, kind: STATE_COMMITTED, state }
          await chrome.runtime.sendMessage(committed).catch(() => undefined)
          return { ok: true, state, meta }
        })
      : Promise.resolve<BackgroundResponse>({ ok: false, error: { message: 'Unsupported Protab request.' } })

  void operation.then(sendResponse, (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error('Unknown Protab background error.')
    sendResponse({
      ok: false,
      error: {
        message: error.message,
        code: error instanceof DomainError ? error.code : undefined,
        existingId: error instanceof DomainError ? error.existingId : undefined,
        storageBlocked: error instanceof StorageDataError,
      },
    })
  })
  return true
})
