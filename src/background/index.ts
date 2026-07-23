import { DomainError } from '../domain/validation'
import { StorageDataError } from '../storage/schema'
import { ChromeStorageAdapter, ChromeMigrationStorageAdapter, loadStateWithMetadata } from '../storage/repository'
import { CommandQueue } from '../storage/commandQueue'
import { MESSAGE_CHANNEL, STATE_COMMITTED, type BackgroundResponse, type ClientMessage, type StateCommittedMessage } from './messages'
import { ChromeToolbarAdapter, serializedToolbarHandler } from './toolbar'
import { ChromeTabsAdapter } from './tabs/chromeTabs'
import { LiveTabsCoordinator } from './tabs/coordinator'
import { ChromeSessionStorageAdapter, OwnershipStore } from './tabs/ownershipStore'
import { CloseTrackerStore, ChromeSessionStorageAdapter as CloseTrackerSessionAdapter } from './tabs/closeTracker'
import { FilingOrchestrator } from './tabs/filing'
import { ActiveProjectStore, ChromeSessionStorageAdapter as ActiveProjectSessionAdapter } from './tabs/activeProjectStore'
import { ProtectedTabsStore, ChromeSessionStorageAdapter as ProtectedTabsSessionAdapter } from './tabs/protectedTabsStore'

const queue = new CommandQueue(new ChromeStorageAdapter())
const chromeStorageAdapter = new ChromeStorageAdapter()
const migrationStorage = new ChromeMigrationStorageAdapter()
const ownership = new OwnershipStore(new ChromeSessionStorageAdapter())
void ownership.initialize().catch((error: unknown) => console.error('Protab could not restrict live ownership storage access.', error))

const closeTracker = new CloseTrackerStore(new CloseTrackerSessionAdapter())
void closeTracker.initialize().catch((error: unknown) => console.error('Protab could not restrict close tracker storage access.', error))

const activeProjectStore = new ActiveProjectStore(new ActiveProjectSessionAdapter())
void activeProjectStore.initialize().catch((error: unknown) => console.error('Protab could not restrict active project storage access.', error))

const protectedTabsStore = new ProtectedTabsStore(new ProtectedTabsSessionAdapter())
void protectedTabsStore.initialize().catch((error: unknown) => console.error('Protab could not restrict protected tabs storage access.', error))

const tabsApi = new ChromeTabsAdapter()

const filingOrchestrator = new FilingOrchestrator(
  tabsApi,
  ownership,
  closeTracker,
  queue,
  () => queue.read(),
  () => {},
  () => liveTabs.scheduleAll(),
  undefined,
  protectedTabsStore,
)

const liveTabs = new LiveTabsCoordinator(tabsApi, ownership, () => queue.read(), queue, closeTracker, filingOrchestrator, activeProjectStore, chromeStorageAdapter, migrationStorage, protectedTabsStore)

// Initialize coordinator with write-through migration
void loadStateWithMetadata(chromeStorageAdapter, migrationStorage)
  .then(async (loaded) => {
    // Ensure Trash project exists
    const trashExists = loaded.state.projects.some((p) => p.name === 'Trash')
    if (!trashExists) {
      const { state } = await queue.execute({ type: 'CREATE_PROJECT', name: 'Trash' })
      loaded.state = state
    }

    await liveTabs.initialize(loaded.state)
    if (loaded.legacyData) {
      // Notify connected workspaces about legacy data
      await chrome.runtime.sendMessage({
        channel: 'protab',
        kind: 'LEGACY_DATA_STATUS',
        available: loaded.legacyData.available,
        schemaVersion: loaded.legacyData.schemaVersion,
        projectCount: loaded.legacyData.projectCount,
        projects: loaded.legacyData.projects,
      }).catch(() => undefined)
    }
  })
  .catch((error: unknown) => console.error('Protab could not initialize live tabs coordinator.', error))

chrome.runtime.onConnect.addListener((port) => liveTabs.connect(port))

// Handle quick-capture command - opens the popup programmatically
chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture') {
    // openPopup() is not supported in all Chromium browsers (e.g. Vivaldi, Edge).
    // Fall back to opening popup.html in a small centered window.
    void chrome.action.openPopup().catch(() => {
      // Get the active tab in the window that triggered the command
      // so we can pass it to the fallback popup window.
      void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([activeTab]) => {
        const width = 480
        const height = 360
        let popupUrl = chrome.runtime.getURL('popup.html')
        if (activeTab?.id) {
          popupUrl += `?tabId=${activeTab.id}`
        }
        void chrome.windows.create({
          url: popupUrl,
          type: 'popup',
          width,
          height,
          focused: true,
        })
      })
    })
  }
})

// Context menu for extension icon - workspace shortcut
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-workspace',
    title: 'Open workspace in new tab',
    contexts: ['action'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-workspace') {
    serializedToolbarHandler(new ChromeToolbarAdapter())(tab!)
  }
})

chrome.tabs.onCreated.addListener((tab) => liveTabs.scheduleWindow(tab.windowId))
chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => liveTabs.scheduleWindow(tab.windowId))
chrome.tabs.onActivated.addListener(({ windowId }) => liveTabs.scheduleWindow(windowId))
chrome.tabs.onMoved.addListener((_tabId, { windowId }) => liveTabs.scheduleWindow(windowId))
chrome.tabs.onAttached.addListener((_tabId, { newWindowId }) => liveTabs.scheduleWindow(newWindowId))
chrome.tabs.onDetached.addListener((_tabId, { oldWindowId }) => liveTabs.scheduleWindow(oldWindowId))
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => {
  liveTabs.resolveTabRemoval(tabId)
  liveTabs.scheduleWindow(windowId)
})
chrome.tabs.onReplaced.addListener(() => liveTabs.scheduleAll())
chrome.windows.onRemoved.addListener(() => liveTabs.scheduleAll())
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    liveTabs.scheduleWindow(windowId)
  }
})

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
