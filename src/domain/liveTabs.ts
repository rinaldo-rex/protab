export interface LiveTabView {
  tabId: number
  windowId: number
  index: number
  active: boolean
  title: string
  url?: string
  urlSummary: string
  hostname?: string
  favIconUrl?: string
  supported: boolean
}

export interface LiveTabInventory {
  windowId: number
  tabs: LiveTabView[]
  stale: boolean
  error?: string
}

export function isSupportedTabUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

function compact(value: string, length = 84): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`
}

export function summarizeTabUrl(value: string | undefined): { summary: string; hostname?: string } {
  if (!value) return { summary: 'URL unavailable' }
  try {
    const url = new URL(value)
    if (isSupportedTabUrl(value)) return { summary: url.hostname, hostname: url.hostname }
    return { summary: compact(`${url.protocol}${url.pathname === '/' ? '' : url.pathname}`) }
  } catch {
    return { summary: compact(value) }
  }
}

export function normalizeChromeTab(tab: chrome.tabs.Tab): LiveTabView | undefined {
  if (tab.id === undefined || tab.windowId === undefined) return undefined
  const { summary, hostname } = summarizeTabUrl(tab.url)
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    title: tab.title?.trim() || hostname || summary || 'Untitled tab',
    url: tab.url,
    urlSummary: summary,
    hostname,
    favIconUrl: tab.favIconUrl,
    supported: isSupportedTabUrl(tab.url),
  }
}

export function isWorkspaceUrl(value: string | undefined, workspaceUrl: string): boolean {
  return value === workspaceUrl
}
