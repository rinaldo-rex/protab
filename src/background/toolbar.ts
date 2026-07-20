export interface ToolbarChrome {
  getWorkspaceUrl(): string
  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>
  activateTab(tabId: number): Promise<void>
  focusWindow(windowId: number): Promise<void>
  createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>
  logError(message: string, error: unknown): void
}

export class ChromeToolbarAdapter implements ToolbarChrome {
  getWorkspaceUrl() { return chrome.runtime.getURL('workspace.html') }
  query(queryInfo: chrome.tabs.QueryInfo) { return chrome.tabs.query(queryInfo) }
  async activateTab(tabId: number) { await chrome.tabs.update(tabId, { active: true }) }
  async focusWindow(windowId: number) { await chrome.windows.update(windowId, { focused: true }) }
  createTab(createProperties: chrome.tabs.CreateProperties) { return chrome.tabs.create(createProperties) }
  logError(message: string, error: unknown) { console.error(message, error) }
}

export async function openOrFocusWorkspace(clickedTab: chrome.tabs.Tab, api: ToolbarChrome): Promise<void> {
  if (clickedTab.windowId === undefined) {
    api.logError('Protab toolbar click had no Chrome window ID.', clickedTab)
    return
  }
  const workspaceUrl = api.getWorkspaceUrl()
  let matches: chrome.tabs.Tab[]
  try {
    matches = await api.query({ windowId: clickedTab.windowId, url: workspaceUrl })
  } catch (error) {
    api.logError(`Protab could not query workspace tabs in window ${clickedTab.windowId}.`, error)
    return
  }
  const existing = matches.find((tab) => tab.id !== undefined)
  if (existing?.id !== undefined) {
    try {
      await api.focusWindow(clickedTab.windowId)
      await api.activateTab(existing.id)
    } catch (error) {
      api.logError(`Protab could not focus workspace tab ${existing.id} in window ${clickedTab.windowId}.`, error)
    }
    return
  }
  try {
    await api.createTab({ windowId: clickedTab.windowId, url: workspaceUrl })
  } catch (error) {
    api.logError(`Protab could not create a workspace in window ${clickedTab.windowId}.`, error)
  }
}

export function serializedToolbarHandler(api: ToolbarChrome) {
  let tail: Promise<void> = Promise.resolve()
  return (tab: chrome.tabs.Tab) => {
    tail = tail.then(() => openOrFocusWorkspace(tab, api), () => openOrFocusWorkspace(tab, api))
  }
}
