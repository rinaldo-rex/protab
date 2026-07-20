import { DomainError } from '../domain/validation'
import { StorageDataError } from '../storage/schema'
import { ChromeStorageAdapter } from '../storage/repository'
import { CommandQueue } from '../storage/commandQueue'
import { MESSAGE_CHANNEL, STATE_COMMITTED, type BackgroundResponse, type ClientMessage, type StateCommittedMessage } from './messages'
import { ChromeToolbarAdapter, serializedToolbarHandler } from './toolbar'
import { ChromeTabsAdapter } from './tabs/chromeTabs'
import { LiveTabsCoordinator } from './tabs/coordinator'
import { ChromeSessionStorageAdapter, OwnershipStore } from './tabs/ownershipStore'

const queue = new CommandQueue(new ChromeStorageAdapter())
const ownership = new OwnershipStore(new ChromeSessionStorageAdapter())
void ownership.initialize().catch((error: unknown) => console.error('Protab could not restrict live ownership storage access.', error))
const liveTabs = new LiveTabsCoordinator(new ChromeTabsAdapter(), ownership, () => queue.read(), queue)

chrome.action.onClicked.addListener(serializedToolbarHandler(new ChromeToolbarAdapter()))
chrome.runtime.onConnect.addListener((port) => liveTabs.connect(port))

chrome.tabs.onCreated.addListener((tab) => liveTabs.scheduleWindow(tab.windowId))
chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => liveTabs.scheduleWindow(tab.windowId))
chrome.tabs.onActivated.addListener(({ windowId }) => liveTabs.scheduleWindow(windowId))
chrome.tabs.onMoved.addListener((_tabId, { windowId }) => liveTabs.scheduleWindow(windowId))
chrome.tabs.onAttached.addListener((_tabId, { newWindowId }) => liveTabs.scheduleWindow(newWindowId))
chrome.tabs.onDetached.addListener((_tabId, { oldWindowId }) => liveTabs.scheduleWindow(oldWindowId))
chrome.tabs.onRemoved.addListener((_tabId, { windowId }) => liveTabs.scheduleWindow(windowId))
chrome.tabs.onReplaced.addListener(() => liveTabs.scheduleAll())
chrome.windows.onRemoved.addListener(() => liveTabs.scheduleAll())

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
