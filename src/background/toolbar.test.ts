import { describe, expect, it, vi } from 'vitest'
import { openOrFocusWorkspace, serializedToolbarHandler, type ToolbarChrome } from './toolbar'

function api(overrides: Partial<ToolbarChrome> = {}): ToolbarChrome {
  return {
    getWorkspaceUrl: () => 'chrome-extension://id/workspace.html',
    query: vi.fn(async () => []),
    activateTab: vi.fn(async () => undefined),
    focusWindow: vi.fn(async () => undefined),
    createTab: vi.fn(async ({ windowId, url }) => ({ id: 99, windowId: windowId!, url } as chrome.tabs.Tab)),
    logError: vi.fn(),
    ...overrides,
  }
}

describe('toolbar workspace behavior', () => {
  it('focuses an existing workspace in the clicked window', async () => {
    const chrome = api({ query: vi.fn(async () => [{ id: 10, windowId: 2 } as chrome.tabs.Tab]) })
    await openOrFocusWorkspace({ windowId: 2 } as chrome.tabs.Tab, chrome)
    expect(chrome.query).toHaveBeenCalledWith({ windowId: 2, url: 'chrome-extension://id/workspace.html' })
    expect(chrome.focusWindow).toHaveBeenCalledWith(2)
    expect(chrome.activateTab).toHaveBeenCalledWith(10)
    expect(chrome.createTab).not.toHaveBeenCalled()
  })

  it('creates only in the clicked window and ignores another window', async () => {
    const chrome = api()
    await openOrFocusWorkspace({ windowId: 4 } as chrome.tabs.Tab, chrome)
    expect(chrome.createTab).toHaveBeenCalledWith({ windowId: 4, url: 'chrome-extension://id/workspace.html' })
  })

  it('does not create after a query failure and retries fresh on next click', async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error('query failed')).mockResolvedValueOnce([])
    const chrome = api({ query })
    await openOrFocusWorkspace({ windowId: 3 } as chrome.tabs.Tab, chrome)
    expect(chrome.createTab).not.toHaveBeenCalled()
    await openOrFocusWorkspace({ windowId: 3 } as chrome.tabs.Tab, chrome)
    expect(query).toHaveBeenCalledTimes(2)
    expect(chrome.createTab).toHaveBeenCalledTimes(1)
  })

  it('serializes overlapping clicks so the second sees the created tab', async () => {
    let existing: chrome.tabs.Tab | undefined
    const chrome = api({
      query: vi.fn(async () => existing ? [existing] : []),
      createTab: vi.fn(async ({ windowId, url }) => {
        existing = { id: 20, windowId: windowId!, url } as chrome.tabs.Tab
        return existing
      }),
    })
    const handler = serializedToolbarHandler(chrome)
    handler({ windowId: 1 } as chrome.tabs.Tab)
    handler({ windowId: 1 } as chrome.tabs.Tab)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(chrome.createTab).toHaveBeenCalledTimes(1)
    expect(chrome.activateTab).toHaveBeenCalledWith(20)
  })

  it('logs create failures and queries again on the next click', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('create failed')).mockResolvedValueOnce({ id: 2 })
    const chrome = api({ createTab: create })
    await openOrFocusWorkspace({ windowId: 8 } as chrome.tabs.Tab, chrome)
    await openOrFocusWorkspace({ windowId: 8 } as chrome.tabs.Tab, chrome)
    expect(chrome.query).toHaveBeenCalledTimes(2)
    expect(chrome.logError).toHaveBeenCalled()
  })
})
