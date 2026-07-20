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
  }
}

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
