import { isWorkspaceUrl, normalizeChromeTab, type LiveTabView } from '../../domain/liveTabs'

export interface ChromeTabsApi {
  workspaceUrl(): string
  query(windowId: number): Promise<chrome.tabs.Tab[]>
  get(tabId: number): Promise<chrome.tabs.Tab>
  activate(tabId: number): Promise<void>
  focusWindow(windowId: number): Promise<void>
}

export class ChromeTabsAdapter implements ChromeTabsApi {
  workspaceUrl() { return chrome.runtime.getURL('workspace.html') }
  query(windowId: number) { return chrome.tabs.query({ windowId }) }
  get(tabId: number) { return chrome.tabs.get(tabId) }
  async activate(tabId: number) { await chrome.tabs.update(tabId, { active: true }) }
  async focusWindow(windowId: number) { await chrome.windows.update(windowId, { focused: true }) }
}

export async function queryOrdinaryTabs(api: ChromeTabsApi, windowId: number): Promise<LiveTabView[]> {
  const workspaceUrl = api.workspaceUrl()
  const tabs = await api.query(windowId)
  return tabs
    .filter((tab) => !isWorkspaceUrl(tab.url, workspaceUrl))
    .map(normalizeChromeTab)
    .filter((tab): tab is LiveTabView => Boolean(tab))
    .sort((left, right) => left.index - right.index)
}
