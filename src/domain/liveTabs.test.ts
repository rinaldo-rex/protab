import { describe, expect, it } from 'vitest'
import { isSupportedTabUrl, isWorkspaceUrl, normalizeChromeTab, summarizeTabUrl } from './liveTabs'

describe('live tab normalization', () => {
  it('supports safe HTTP URLs and rejects credentials and other schemes', () => {
    expect(isSupportedTabUrl('https://example.com/path')).toBe(true)
    expect(isSupportedTabUrl('https://user:secret@example.com/')).toBe(false)
    expect(isSupportedTabUrl('chrome://settings/')).toBe(false)
    expect(isSupportedTabUrl(undefined)).toBe(false)
  })

  it('normalizes display data without losing full URL and title', () => {
    expect(normalizeChromeTab({ id: 4, windowId: 2, index: 3, active: true, url: 'https://example.com/path', title: ' Full title ', favIconUrl: 'https://example.com/favicon.ico' } as chrome.tabs.Tab)).toEqual({
      tabId: 4,
      windowId: 2,
      index: 3,
      active: true,
      url: 'https://example.com/path',
      title: 'Full title',
      urlSummary: 'example.com',
      hostname: 'example.com',
      favIconUrl: 'https://example.com/favicon.ico',
      supported: true,
    })
  })

  it('summarizes unsupported pages and matches only the exact workspace URL', () => {
    expect(summarizeTabUrl('chrome://settings/privacy')).toEqual({ summary: 'chrome:/privacy' })
    expect(isWorkspaceUrl('chrome-extension://id/workspace.html', 'chrome-extension://id/workspace.html')).toBe(true)
    expect(isWorkspaceUrl('chrome-extension://other/workspace.html', 'chrome-extension://id/workspace.html')).toBe(false)
  })
})
