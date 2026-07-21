import { describe, expect, it, vi } from 'vitest'
import { LIVE_TAB_PORT } from '../messages'
import { type ChromeTabsApi } from './chromeTabs'
import { LiveTabsCoordinator } from './coordinator'

class Event<T extends (...args: never[]) => void> {
  listeners: T[] = []
  addListener(listener: T) { this.listeners.push(listener) }
  emit(...args: Parameters<T>) { this.listeners.forEach((listener) => listener(...args)) }
}

function port(tab: chrome.tabs.Tab) {
  const onMessage = new Event<(message: unknown) => void>()
  const onDisconnect = new Event<() => void>()
  return {
    name: LIVE_TAB_PORT,
    sender: { tab },
    onMessage,
    onDisconnect,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as chrome.runtime.Port & { onMessage: typeof onMessage; onDisconnect: typeof onDisconnect; postMessage: ReturnType<typeof vi.fn> }
}

function api(): ChromeTabsApi {
  return {
    workspaceUrl: () => 'chrome-extension://id/workspace.html',
    query: vi.fn(async (windowId) => [{ id: windowId * 10, windowId, index: 0, active: true, url: `https://${windowId}.test/`, title: `Window ${windowId}` }] as chrome.tabs.Tab[]),
    get: vi.fn(async (tabId) => ({ id: tabId, windowId: 1 } as chrome.tabs.Tab)),
    activate: vi.fn(async () => undefined),
    focusWindow: vi.fn(async () => undefined),
    create: vi.fn(async (windowId, url) => ({ id: 99, windowId, url } as chrome.tabs.Tab)),
    remove: vi.fn(async () => undefined),
  }
}

function createOwnershipStore() {
  const entries: import('../../domain/ownership').OwnershipEntry[] = []
  return {
    entries,
    store: {
      read: vi.fn(async () => structuredClone(entries)),
      replace: vi.fn(async (next: typeof entries) => { entries.splice(0, entries.length, ...next) }),
      update: vi.fn(async (mutate: (current: typeof entries) => typeof entries) => { entries.splice(0, entries.length, ...mutate(structuredClone(entries))); return entries }),
    },
  }
}

const projectState = { schemaVersion: 1 as const, projects: [{ id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://1.test/', title: 'One', titleSource: 'automatic' as const, tags: [], notes: '' }] }] }

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('live tabs coordinator', () => {
  it('binds clients to sender windows and sends isolated snapshots', async () => {
    const chrome = api()
    const coordinator = new LiveTabsCoordinator(chrome)
    const first = port({ id: 101, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    const second = port({ id: 202, windowId: 2, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(first)
    coordinator.connect(second)
    await tick()
    expect(first.postMessage).toHaveBeenCalledWith(expect.objectContaining({ inventory: expect.objectContaining({ windowId: 1 }) }))
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({ inventory: expect.objectContaining({ windowId: 2 }) }))
  })

  it('rejects invalid senders and validates a focused tab window', async () => {
    const chrome = api()
    const coordinator = new LiveTabsCoordinator(chrome)
    const invalid = port({ id: 1, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
    coordinator.connect(invalid)
    expect(invalid.disconnect).toHaveBeenCalled()

    const valid = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(valid)
    await tick()
    valid.onMessage.emit({ kind: 'FOCUS_LIVE_TAB', tabId: 10 })
    await tick()
    expect(chrome.focusWindow).toHaveBeenCalledWith(1)
    expect(chrome.activate).toHaveBeenCalledWith(10)
  })

  it('assigns only after revalidating the current URL candidate', async () => {
    const chrome = api()
    const state = projectState
    const { entries, store: ownership } = createOwnershipStore()
    const coordinator = new LiveTabsCoordinator(chrome, ownership as never, async () => state)
    const client = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(client)
    await tick()
    client.onMessage.emit({ kind: 'ASSIGN_LIVE_TAB', tabId: 10, projectId: 'p1', savedUrlId: 'u1' })
    await tick()
    expect(entries).toEqual([{ tabId: 10, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://1.test/' }])
    expect(chrome.activate).not.toHaveBeenCalled()
  })

  it('opens with owned, unassigned, then create precedence', async () => {
    const chrome = api()
    const { entries, store } = createOwnershipStore()
    const coordinator = new LiveTabsCoordinator(chrome, store as never, async () => projectState)
    const client = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(client)
    await tick()

    entries.push({ tabId: 10, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://1.test/' })
    client.onMessage.emit({ kind: 'OPEN_SAVED_URL', projectId: 'p1', savedUrlId: 'u1' })
    await tick()
    expect(chrome.activate).toHaveBeenCalledWith(10)
    expect(chrome.create).not.toHaveBeenCalled()

    entries.splice(0)
    vi.mocked(chrome.activate).mockClear()
    client.onMessage.emit({ kind: 'OPEN_SAVED_URL', projectId: 'p1', savedUrlId: 'u1' })
    await tick()
    expect(chrome.activate).toHaveBeenCalledWith(10)
    expect(entries[0]).toMatchObject({ tabId: 10, projectId: 'p1', savedUrlId: 'u1' })

    entries.splice(0)
    vi.mocked(chrome.query).mockResolvedValue([])
    client.onMessage.emit({ kind: 'OPEN_SAVED_URL', projectId: 'p1', savedUrlId: 'u1' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(chrome.create).toHaveBeenCalledWith(1, 'https://1.test/')
    expect(store.update).toHaveBeenCalled()
  })

  it('always creates another owned copy', async () => {
    const chrome = api()
    const { entries, store } = createOwnershipStore()
    entries.push({ tabId: 10, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://1.test/' })
    const coordinator = new LiveTabsCoordinator(chrome, store as never, async () => projectState)
    const client = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(client)
    await tick()
    client.onMessage.emit({ kind: 'OPEN_SAVED_URL_COPY', projectId: 'p1', savedUrlId: 'u1' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(chrome.create).toHaveBeenCalledWith(1, 'https://1.test/')
    expect(chrome.activate).not.toHaveBeenCalled()
    expect(store.update).toHaveBeenCalled()
  })

  it('chooses the most recently accessed eligible owned instance', async () => {
    const chrome = api()
    vi.mocked(chrome.query).mockResolvedValue([
      { id: 10, windowId: 1, index: 0, active: false, url: 'https://1.test/', lastAccessed: 100 },
      { id: 11, windowId: 1, index: 1, active: false, url: 'https://1.test/', lastAccessed: 200 },
    ] as chrome.tabs.Tab[])
    const { entries, store } = createOwnershipStore()
    entries.push(
      { tabId: 10, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://1.test/' },
      { tabId: 11, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://1.test/' },
    )
    const coordinator = new LiveTabsCoordinator(chrome, store as never, async () => projectState)
    const client = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(client)
    await tick()
    client.onMessage.emit({ kind: 'OPEN_SAVED_URL', projectId: 'p1', savedUrlId: 'u1' })
    await tick()
    expect(chrome.activate).toHaveBeenLastCalledWith(11)
  })

  it('retains the last snapshot when a query fails and retries', async () => {
    const chrome = api()
    const coordinator = new LiveTabsCoordinator(chrome)
    const client = port({ id: 2, windowId: 1, url: chrome.workspaceUrl() } as chrome.tabs.Tab)
    coordinator.connect(client)
    await tick()
    vi.mocked(chrome.query).mockRejectedValueOnce(new Error('permission unavailable'))
    client.onMessage.emit({ kind: 'RETRY_TAB_INVENTORY' })
    await tick()
    expect(client.postMessage).toHaveBeenLastCalledWith({ kind: 'LIVE_TAB_INVENTORY', inventory: expect.objectContaining({ stale: true, error: 'permission unavailable', tabs: expect.any(Array) }) })
  })
})
