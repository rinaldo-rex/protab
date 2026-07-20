import { describe, expect, it, vi } from 'vitest'
import { queryOrdinaryTabs, type ChromeTabsApi } from './chromeTabs'

function api(tabs: chrome.tabs.Tab[]): ChromeTabsApi {
  return {
    workspaceUrl: () => 'chrome-extension://id/workspace.html',
    query: vi.fn(async () => tabs),
    get: vi.fn(),
    activate: vi.fn(),
    focusWindow: vi.fn(),
    create: vi.fn(async (windowId, url) => ({ id: 99, windowId, url } as chrome.tabs.Tab)),
  }
}

describe('current-window tab inventory', () => {
  it('excludes every workspace and preserves Chrome index order', async () => {
    const chrome = api([
      { id: 3, windowId: 7, index: 3, active: false, url: 'https://later.test/', title: 'Later' },
      { id: 1, windowId: 7, index: 0, active: true, url: 'chrome-extension://id/workspace.html', title: 'Protab' },
      { id: 2, windowId: 7, index: 1, active: false, url: 'chrome://settings/', title: 'Settings' },
      { id: 4, windowId: 7, index: 2, active: false, url: 'chrome-extension://id/workspace.html', title: 'Protab copy' },
    ] as chrome.tabs.Tab[])
    const tabs = await queryOrdinaryTabs(chrome, 7)
    expect(chrome.query).toHaveBeenCalledWith(7)
    expect(tabs.map((tab) => tab.tabId)).toEqual([2, 3])
    expect(tabs[0].supported).toBe(false)
  })
})
