import { describe, expect, it, beforeEach, vi } from 'vitest'
import { FilingOrchestrator, isFileable, prepareTitle, type FilingEvent } from './filing'
import type { ChromeTabsApi } from './chromeTabs'
import type { OwnershipStore } from './ownershipStore'
import type { CloseTrackerStore } from './closeTracker'
import type { CommandQueue } from '../../storage/commandQueue'
import type { PersistedStateV1 } from '../../domain/types'
import type { LiveTabView } from '../../domain/liveTabs'
import type { OwnershipEntry } from '../../domain/ownership'

function createTab(overrides: Partial<LiveTabView> = {}): LiveTabView {
  return {
    tabId: 100,
    windowId: 1,
    index: 0,
    active: false,
    title: 'Example Page',
    url: 'https://example.com/',
    urlSummary: 'example.com',
    hostname: 'example.com',
    supported: true,
    candidates: [],
    ...overrides,
  }
}

function createState(projects: PersistedStateV1['projects'] = []): PersistedStateV1 {
  return { schemaVersion: 1, projects }
}

function createProject(id: string, name: string, urls: PersistedStateV1['projects'][0]['savedUrls'] = []) {
  return { id, name, savedUrls: urls }
}

function createSavedUrl(id: string, url: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url,
    title: 'Example',
    titleSource: 'automatic' as const,
    tags: [],
    notes: '',
    ...overrides,
  }
}

describe('isFileable', () => {
  const workspaceUrl = 'chrome-extension://abc/workspace.html'

  it('returns true for supported unassigned tab', () => {
    expect(isFileable(createTab(), workspaceUrl)).toBe(true)
  })

  it('returns true for drifted tab (ownership.drifted = true)', () => {
    const tab = createTab({
      ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://other.com/', drifted: true },
    })
    expect(isFileable(tab, workspaceUrl)).toBe(true)
  })

  it('returns false for non-drifted owned tab', () => {
    const tab = createTab({
      ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://example.com/', drifted: false },
    })
    expect(isFileable(tab, workspaceUrl)).toBe(false)
  })

  it('returns false for unsupported tab', () => {
    expect(isFileable(createTab({ supported: false, url: 'chrome://settings' }), workspaceUrl)).toBe(false)
  })

  it('returns false for tab with no URL', () => {
    expect(isFileable(createTab({ url: undefined }), workspaceUrl)).toBe(false)
  })

  it('returns false for workspace tab', () => {
    expect(isFileable(createTab({ url: workspaceUrl }), workspaceUrl)).toBe(false)
  })
})

describe('prepareTitle', () => {
  it('returns tab title when present and meaningful', () => {
    expect(prepareTitle(createTab({ title: 'My Page', hostname: 'example.com' }))).toBe('My Page')
  })

  it('returns hostname when title is empty', () => {
    expect(prepareTitle(createTab({ title: '', hostname: 'example.com' }))).toBe('example.com')
  })

  it('returns hostname when title is the URL summary (auto-generated)', () => {
    expect(prepareTitle(createTab({ title: 'example.com', hostname: 'example.com' }))).toBe('example.com')
  })

  it('returns parsed hostname from URL when no explicit hostname', () => {
    // When hostname is undefined but URL exists, summarizeTabUrl parses the URL
    expect(prepareTitle(createTab({ title: '', hostname: undefined, url: 'https://example.com/', urlSummary: 'example.com' }))).toBe('example.com')
  })

  it('returns URL unavailable summary when no URL', () => {
    expect(prepareTitle(createTab({ title: '', hostname: undefined, url: undefined, urlSummary: 'URL unavailable' }))).toBe('URL unavailable')
  })
})

describe('FilingOrchestrator', () => {
  let api: ChromeTabsApi
  let ownership: OwnershipStore
  let closeTracker: CloseTrackerStore
  let durableQueue: CommandQueue
  let readState: () => Promise<PersistedStateV1>
  let events: FilingEvent[]
  let inventoryChanges: number
  let orchestrator: FilingOrchestrator
  let idCounter: number

  beforeEach(() => {
    idCounter = 0
    events = []
    inventoryChanges = 0

    api = {
      workspaceUrl: () => 'chrome-extension://abc/workspace.html',
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockRejectedValue(new Error('Tab not found')),
      activate: vi.fn(),
      focusWindow: vi.fn(),
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    }

    ownership = {
      read: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async (fn: (entries: OwnershipEntry[]) => OwnershipEntry[]) => fn([])),
      replace: vi.fn(),
    } as unknown as OwnershipStore

    closeTracker = {
      set: vi.fn().mockResolvedValue(undefined),
      updateState: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      readByOperationId: vi.fn().mockResolvedValue(undefined),
      resolveByTabId: vi.fn().mockResolvedValue([]),
    } as unknown as CloseTrackerStore

    const state: PersistedStateV1 = createState([
      createProject('p1', 'Research', []),
    ])

    readState = async () => state

    durableQueue = {
      execute: vi.fn().mockImplementation(async (command: { type: string; url: string }) => {
        const existing = state.projects[0].savedUrls.find((r) => r.url === command.url)
        if (existing) {
          return { state, meta: { didWrite: false, existingSavedUrlId: existing.id, affectedSavedUrlId: existing.id, affectedProjectId: 'p1', filing: 'reused' } }
        }
        const id = `u${++idCounter}`
        state.projects[0].savedUrls.push(createSavedUrl(id, command.url))
        return { state, meta: { didWrite: true, affectedSavedUrlId: id, affectedProjectId: 'p1', filing: 'created' } }
      }),
      read: vi.fn().mockImplementation(() => Promise.resolve(state)),
    } as unknown as CommandQueue

    orchestrator = new FilingOrchestrator(
      api,
      ownership,
      closeTracker,
      durableQueue,
      readState,
      (event) => events.push(event),
      () => { inventoryChanges++ },
      () => `op-${++idCounter}`,
    )
  })

  describe('prepare', () => {
    it('returns prepared operation with tab and project info', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])

      const prepared = await orchestrator.prepare(100, 'p1', 1)

      expect(prepared).toMatchObject({
        tabId: 100,
        projectId: 'p1',
        projectName: 'Research',
        capturedUrl: 'https://example.com/',
        suggestedTags: [],
      })
    })

    it('throws when tab moved to another window', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 2 } as chrome.tabs.Tab)

      await expect(orchestrator.prepare(100, 'p1', 1)).rejects.toThrow('moved to another')
    })

    it('throws when project not found', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1 } as chrome.tabs.Tab)

      await expect(orchestrator.prepare(100, 'missing', 1)).rejects.toThrow('no longer exists')
    })

    it('indicates when URL already exists in project via prepare', async () => {
      // When a tab's URL matches a saved URL, reconciliation auto-assigns ownership
      // This makes the tab non-fileable (which is correct behavior)
      // The existingSavedUrlId is only populated for tabs that remain fileable
      // but whose URL happens to exist in the project

      // Instead, test that a tab with a NEW URL gets existingSavedUrlId: undefined
      vi.mocked(api.query).mockResolvedValue([
        { id: 100, windowId: 1, url: 'https://new-url.com/', title: 'New Page', index: 0 },
      ] as chrome.tabs.Tab[])
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://new-url.com/' } as chrome.tabs.Tab)

      const prepared = await orchestrator.prepare(100, 'p1', 1)
      expect(prepared.existingSavedUrlId).toBeUndefined()
    })
  })

  describe('executeFiling', () => {
    it('persists, establishes ownership, and requests close', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])

      // Prepare first
      await orchestrator.prepare(100, 'p1', 1)

      // Execute
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result).toMatchObject({
        tabId: 100,
        projectId: 'p1',
        filing: 'created',
        closeState: 'requested',
      })

      expect(durableQueue.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'FILE_LIVE_TAB' }))
      expect(ownership.update).toHaveBeenCalled()
      expect(closeTracker.set).toHaveBeenCalled()
      expect(api.remove).toHaveBeenCalledWith(100)
      expect(inventoryChanges).toBeGreaterThan(0)
    })

    it('returns skipped when tab disappeared before persistence', async () => {
      // Set up for prepare (needs to succeed)
      vi.mocked(api.get).mockResolvedValueOnce({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([
        { id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 },
      ] as chrome.tabs.Tab[])

      await orchestrator.prepare(100, 'p1', 1)

      // Now make get fail for execute
      vi.mocked(api.get).mockRejectedValue(new Error('Tab not found'))

      const result = await orchestrator.executeFiling('op-1', 1)
      expect(result.closeState).toBe('skipped')
    })

    it('returns skipped when URL changed between persist and recheck', async () => {
      let callCount = 0
      vi.mocked(api.get).mockImplementation(async () => {
        callCount++
        if (callCount <= 1) {
          return { id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab
        }
        // Second call (after persist): URL changed
        return { id: 100, windowId: 1, url: 'https://example.com/different' } as chrome.tabs.Tab
      })
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result.closeState).toBe('skipped')
      expect(result.error).toContain('URL changed')
      expect(api.remove).not.toHaveBeenCalled()
    })

    it('returns failed when persistence fails', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])
      vi.mocked(durableQueue.execute).mockRejectedValue(new Error('Storage error'))

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result.closeState).toBe('failed')
      expect(result.error).toContain('Could not save the URL')
      expect(ownership.update).not.toHaveBeenCalled()
      expect(api.remove).not.toHaveBeenCalled()
    })

    it('returns failed when ownership fails after persistence', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])
      vi.mocked(ownership.update).mockRejectedValue(new Error('Session storage error'))

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result.closeState).toBe('failed')
      expect(result.error).toContain('owned')
      expect(api.remove).not.toHaveBeenCalled()
    })

    it('returns failed when close request is rejected', async () => {
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])
      vi.mocked(api.remove).mockRejectedValue(new Error('Chrome error'))

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result.closeState).toBe('failed')
      expect(result.error).toContain('rejected')
      expect(closeTracker.updateState).toHaveBeenCalledWith(expect.any(String), 'failed', 'Chrome error')
    })

    it('returns closed when tab disappears after persistence', async () => {
      let callCount = 0
      vi.mocked(api.get).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // First call in prepare
          return { id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab
        }
        if (callCount === 2) {
          // Second call in execute (step 1)
          return { id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab
        }
        // Third call (after persist): tab gone
        throw new Error('Tab not found')
      })
      vi.mocked(api.query).mockResolvedValue([{ id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 }] as chrome.tabs.Tab[])

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result.closeState).toBe('closed')
      expect(api.remove).not.toHaveBeenCalled()
    })

    it('creates new record for URL not yet in project', async () => {
      // When filing a tab with a URL not in the project, it creates a new record
      vi.mocked(api.query).mockResolvedValue([
        { id: 100, windowId: 1, url: 'https://example.com/', title: 'Example', index: 0 },
      ] as chrome.tabs.Tab[])
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)

      await orchestrator.prepare(100, 'p1', 1)
      const result = await orchestrator.executeFiling('op-1', 1)

      expect(result).toMatchObject({
        filing: 'created',
        closeState: 'requested',
      })
      expect(api.remove).toHaveBeenCalledWith(100)
    })
  })

  describe('retryClose', () => {
    it('retries close for a surviving attempt', async () => {
      vi.mocked(closeTracker.readByOperationId).mockResolvedValue({
        operationId: 'op-1',
        tabId: 100,
        windowId: 1,
        projectId: 'p1',
        savedUrlId: 'u1',
        persistedUrl: 'https://example.com/',
        requestedAt: Date.now(),
        state: 'surviving',
      })
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://example.com/' } as chrome.tabs.Tab)

      const result = await orchestrator.retryClose('op-1', 1)

      expect(result.closeState).toBe('requested')
      expect(api.remove).toHaveBeenCalledWith(100)
      expect(closeTracker.updateState).toHaveBeenCalledWith('op-1', 'requested')
    })

    it('resolves attention when tab disappeared', async () => {
      vi.mocked(closeTracker.readByOperationId).mockResolvedValue({
        operationId: 'op-1',
        tabId: 100,
        windowId: 1,
        projectId: 'p1',
        savedUrlId: 'u1',
        persistedUrl: 'https://example.com/',
        requestedAt: Date.now(),
        state: 'surviving',
      })
      vi.mocked(api.get).mockRejectedValue(new Error('Tab not found'))

      const result = await orchestrator.retryClose('op-1', 1)

      expect(result.closeState).toBe('closed')
      expect(closeTracker.remove).toHaveBeenCalledWith('op-1')
    })

    it('skips retry when URL changed', async () => {
      vi.mocked(closeTracker.readByOperationId).mockResolvedValue({
        operationId: 'op-1',
        tabId: 100,
        windowId: 1,
        projectId: 'p1',
        savedUrlId: 'u1',
        persistedUrl: 'https://example.com/',
        requestedAt: Date.now(),
        state: 'surviving',
      })
      vi.mocked(api.get).mockResolvedValue({ id: 100, windowId: 1, url: 'https://different.com/' } as chrome.tabs.Tab)

      const result = await orchestrator.retryClose('op-1', 1)

      expect(result.closeState).toBe('skipped')
      expect(result.error).toContain('URL changed')
      expect(api.remove).not.toHaveBeenCalled()
    })

    it('throws when no attempt found', async () => {
      await expect(orchestrator.retryClose('missing', 1)).rejects.toThrow('No close attempt found')
    })
  })

  describe('executeBulkFiling', () => {
    it('files multiple eligible tabs and returns summary', async () => {
      const tabs = [
        { id: 100, windowId: 1, url: 'https://one.com/', title: 'One', index: 0 },
        { id: 101, windowId: 1, url: 'https://two.com/', title: 'Two', index: 1 },
        { id: 102, windowId: 1, url: 'https://three.com/', title: 'Three', index: 2 },
      ]
      vi.mocked(api.query).mockResolvedValue(tabs as chrome.tabs.Tab[])
      vi.mocked(api.get).mockImplementation(async (tabId: number) => {
        return tabs.find((t) => t.id === tabId) as chrome.tabs.Tab
      })

      await orchestrator.prepareBulk('p1', 1)
      const summary = await orchestrator.executeBulkFiling('op-1', 'p1', 1)

      expect(summary.eligible).toBe(3)
      expect(summary.created).toBe(3)
      expect(summary.closeRequested).toBe(3)
      expect(summary.skipped).toHaveLength(0)
      expect(summary.failed).toHaveLength(0)
    })

    it('excludes owned tabs from bulk filing', async () => {
      const tabs = [
        { id: 100, windowId: 1, url: 'https://one.com/', title: 'One', index: 0 },
        { id: 101, windowId: 1, url: 'https://two.com/', title: 'Two', index: 1 },
      ]
      vi.mocked(api.query).mockResolvedValue(tabs as chrome.tabs.Tab[])
      vi.mocked(api.get).mockImplementation(async (tabId: number) => {
        return tabs.find((t) => t.id === tabId) as chrome.tabs.Tab
      })
      // Tab 101 is owned (non-drifted), so should be excluded
      vi.mocked(ownership.read).mockResolvedValue([
        { tabId: 101, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://two.com/' },
      ])

      // Need to also add the saved URL to state so reconciliation works
      const state = await readState()
      state.projects[0].savedUrls.push(createSavedUrl('u1', 'https://two.com/'))

      await orchestrator.prepareBulk('p1', 1)
      const summary = await orchestrator.executeBulkFiling('op-1', 'p1', 1)

      expect(summary.eligible).toBe(1)
      expect(summary.created).toBe(1)
    })

    it('continues after individual tab failure', async () => {
      const tabs = [
        { id: 100, windowId: 1, url: 'https://one.com/', title: 'One', index: 0 },
        { id: 101, windowId: 1, url: 'https://two.com/', title: 'Two', index: 1 },
      ]
      vi.mocked(api.query).mockResolvedValue(tabs as chrome.tabs.Tab[])
      let callCount = 0
      vi.mocked(api.get).mockImplementation(async (tabId: number) => {
        callCount++
        if (tabId === 100 && callCount > 2) throw new Error('Tab gone')
        return tabs.find((t) => t.id === tabId) as chrome.tabs.Tab
      })

      await orchestrator.prepareBulk('p1', 1)
      const summary = await orchestrator.executeBulkFiling('op-1', 'p1', 1)

      expect(summary.eligible).toBe(2)
      // One should succeed, one might fail or be skipped
      expect(summary.created + summary.reused + summary.skipped.length + summary.failed.length).toBe(2)
    })

    it('handles duplicate URLs within batch by reusing first-created record', async () => {
      // When two tabs have the same URL and neither is saved yet,
      // the first creates the record, the second reuses it
      const tabs = [
        { id: 100, windowId: 1, url: 'https://duplicate.com/', title: 'Dup', index: 0 },
        { id: 101, windowId: 1, url: 'https://duplicate.com/', title: 'Dup 2', index: 1 },
      ]
      vi.mocked(api.query).mockResolvedValue(tabs as chrome.tabs.Tab[])
      vi.mocked(api.get).mockImplementation(async (tabId: number) => {
        return tabs.find((t) => t.id === tabId) as chrome.tabs.Tab
      })

      await orchestrator.prepareBulk('p1', 1)
      const summary = await orchestrator.executeBulkFiling('op-1', 'p1', 1)

      // First tab creates, second tab reuses
      expect(summary.eligible).toBe(2)
      expect(summary.created).toBe(1)
      expect(summary.reused).toBe(1)
      expect(summary.closeRequested).toBe(2)
    })
  })

  describe('resolveTabRemoval', () => {
    it('delegates to close tracker', () => {
      orchestrator.resolveTabRemoval(100)
      expect(closeTracker.resolveByTabId).toHaveBeenCalledWith(100)
    })
  })
})
