import type { PersistedState } from '../../domain/types'
import type { CommandQueue } from '../../storage/commandQueue'
import { reconcileOwnership } from '../../domain/ownership'
import type { LiveTabView } from '../../domain/liveTabs'
import { isSupportedTabUrl, summarizeTabUrl } from '../../domain/liveTabs'
import { suggestTags } from '../../domain/tagSuggestions'
import type { ChromeTabsApi } from './chromeTabs'
import { queryOrdinaryTabs } from './chromeTabs'
import type { OwnershipStore } from './ownershipStore'
import type { CloseTrackerStore } from './closeTracker'
import type { ProtectedTabsStore } from './protectedTabsStore'
import type { CloseProtectionDecision } from './closeGuard'
import { checkCloseProtection } from './closeGuard'

export interface PreparedFilingOperation {
  operationId: string
  tabId: number
  projectId: string
  projectName: string
  capturedUrl: string
  capturedTitle: string
  suggestedTags: string[]
  existingSavedUrlId?: string
}

export interface FilingResult {
  operationId: string
  tabId: number
  projectId: string
  savedUrlId: string
  filing: 'created' | 'reused'
  closeState: 'closed' | 'requested' | 'skipped' | 'failed'
  error?: string
}

export type FilingSkipReason =
  | 'url-changed'
  | 'tab-moved'
  | 'tab-disappeared'
  | 'unsupported-url'
  | 'not-fileable'
  | 'project-missing'
  | 'ownership-failed'

export interface FilingSummary {
  eligible: number
  created: number
  reused: number
  alreadyClosed: number
  closeRequested: number
  surviving: number
  skipped: Array<{ tabId?: number; reason: FilingSkipReason }>
  failed: Array<{ tabId?: number; stage: 'persist' | 'ownership' | 'close'; message: string }>
}

export type FilingEvent =
  | { type: 'result'; result: FilingResult }
  | { type: 'summary'; summary: FilingSummary }

export function isFileable(tab: LiveTabView, workspaceUrl: string): boolean {
  if (!tab.supported || !tab.url) return false
  if (tab.url === workspaceUrl) return false
  if (isSupportedTabUrl(tab.url) === false) return false
  // Must be unassigned (no ownership or drifted)
  if (tab.ownership && !tab.ownership.drifted) return false
  return true
}

export const TITLE_MAX_LENGTH = 200

export function prepareTitle(tab: LiveTabView): string {
  let title: string
  if (tab.title && tab.title.trim() && tab.title !== summarizeTabUrl(tab.url).summary) {
    title = tab.title.trim()
  } else if (tab.hostname) {
    title = tab.hostname
  } else {
    title = summarizeTabUrl(tab.url).summary
  }
  if (title.length > TITLE_MAX_LENGTH) {
    title = title.slice(0, TITLE_MAX_LENGTH)
  }
  return title
}

export class FilingOrchestrator {
  private preparedOperations = new Map<string, PreparedFilingOperation>()

  constructor(
    private readonly api: ChromeTabsApi,
    private readonly ownership: OwnershipStore,
    private readonly closeTracker: CloseTrackerStore,
    private readonly durableQueue: CommandQueue,
    private readonly readState: () => Promise<PersistedState>,
    private readonly onEvent: (event: FilingEvent) => void,
    private readonly onInventoryChange: () => void,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly protectedTabsStore?: ProtectedTabsStore,
  ) {}

  async prepare(
    tabId: number,
    projectId: string,
    windowId: number,
  ): Promise<PreparedFilingOperation> {
    const [tab, state] = await Promise.all([
      this.api.get(tabId),
      this.readState(),
    ])

    if (tab.windowId !== windowId) {
      throw new Error('That tab moved to another Chrome window.')
    }

    const project = state.projects.find((p) => p.id === projectId)
    if (!project) {
      throw new Error('That project no longer exists.')
    }

    const rawTabs = await queryOrdinaryTabs(this.api, windowId)
    const entries = await this.ownership.read()
    const reconciled = reconcileOwnership(state, rawTabs, entries)
    const liveTab = reconciled.tabs.find((t) => t.tabId === tabId)

    if (!liveTab || !isFileable(liveTab, this.api.workspaceUrl())) {
      throw new Error('That tab cannot be filed.')
    }

    const capturedUrl = liveTab.url!
    const existingRecord = project.savedUrls.find((r) => r.url === capturedUrl)

    const operationId = this.createId()
    const operation: PreparedFilingOperation = {
      operationId,
      tabId,
      projectId,
      projectName: project.name,
      capturedUrl,
      capturedTitle: prepareTitle(liveTab),
      suggestedTags: suggestTags(liveTab.hostname ?? ''),
      existingSavedUrlId: existingRecord?.id,
    }

    this.preparedOperations.set(operationId, operation)
    return operation
  }

  async executeFiling(
    operationId: string,
    windowId: number,
  ): Promise<FilingResult> {
    const prepared = this.preparedOperations.get(operationId)
    if (!prepared) {
      throw new Error('This operation is no longer valid. Please try again.')
    }

    const { tabId, projectId } = prepared
    this.preparedOperations.delete(operationId)

    // Step 1: Re-read latest project and tab
    const [tab, state] = await Promise.all([
      this.api.get(tabId).catch(() => null),
      this.readState(),
    ])

    // Step 2: Verify tab still in acting window and fileable
    if (!tab || tab.windowId !== windowId) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId: '',
        filing: 'created',
        closeState: 'skipped',
        error: tab ? 'Tab moved to another window.' : 'Tab disappeared.',
      }
    }

    const project = state.projects.find((p) => p.id === projectId)
    if (!project) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId: '',
        filing: 'created',
        closeState: 'skipped',
        error: 'Project no longer exists.',
      }
    }

    // Step 3: Capture and serialize current URL
    const rawTabs = await queryOrdinaryTabs(this.api, windowId)
    const entries = await this.ownership.read()
    const reconciled = reconcileOwnership(state, rawTabs, entries)
    const liveTab = reconciled.tabs.find((t) => t.tabId === tabId)

    if (!liveTab || !isFileable(liveTab, this.api.workspaceUrl())) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId: '',
        filing: 'created',
        closeState: 'skipped',
        error: 'Tab is no longer eligible for filing.',
      }
    }

    const persistedUrl = liveTab.url!
    const capturedTitle = prepareTitle(liveTab)
    const suggestedTags = suggestTags(liveTab.hostname ?? '')

    // Step 4: Execute FILE_LIVE_TAB through CommandQueue
    try {
      const { meta } = await this.durableQueue.execute({
        type: 'FILE_LIVE_TAB',
        projectId,
        url: persistedUrl,
        capturedTitle,
        suggestedTags,
      })

      const savedUrlId = meta.affectedSavedUrlId!
      const filing = meta.filing!

      // Step 7: Re-read tab for URL recheck
      const tabAfterPersist = await this.api.get(tabId).catch(() => null)

      // Step 8: Tab disappeared after persist
      if (!tabAfterPersist) {
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'closed',
          error: undefined,
        }
      }

      // Step 9: URL recheck
      const currentUrl = tabAfterPersist.url
      if (currentUrl && currentUrl !== persistedUrl) {
        // URL changed — keep record, skip ownership/close
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'skipped',
          error: 'URL changed — not closed. File again if needed.',
        }
      }

      // Step 10: Establish ownership
      try {
        await this.ownership.update((current) => [
          ...current.filter((entry) => entry.tabId !== tabId),
          {
            tabId,
            windowId,
            projectId,
            savedUrlId,
            establishedUrl: persistedUrl,
          },
        ])
      } catch {
        // Ownership failed — preserve record, don't close
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'failed',
          error: 'Saved, but Protab could not mark tab as owned.',
        }
      }

      // Step 11: Register close tracking
      await this.closeTracker.set({
        operationId,
        tabId,
        windowId,
        projectId,
        savedUrlId,
        persistedUrl,
        requestedAt: Date.now(),
        state: 'requested',
      })

      // Step 11.5: Check protection before close
      const protection = await this.checkProtection(tabId)
      if (protection.protected) {
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'skipped',
          error: `Protected: ${protection.reasons.join(', ')}. Not closed.`,
        }
      }

      // Step 12: Issue non-blocking close request
      try {
        await this.api.remove(tabId)
        // Close request accepted — tab may still be open (beforeunload)
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'requested',
        }
      } catch (error) {
        // Close request rejected
        await this.closeTracker.updateState(
          operationId,
          'failed',
          error instanceof Error ? error.message : 'Chrome rejected the close request.',
        )
        this.onInventoryChange()
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'failed',
          error: 'Saved, but Chrome rejected the close request.',
        }
      }
    } catch {
      // Persistence failed — stop, no ownership, no close
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId: '',
        filing: 'created',
        closeState: 'failed',
        error: 'Could not save the URL.',
      }
    }
  }

  async prepareBulk(
    projectId: string,
    windowId: number,
  ): Promise<{ operationId: string; eligible: number; projectName: string }> {
    const [state, rawTabs, entries] = await Promise.all([
      this.readState(),
      queryOrdinaryTabs(this.api, windowId),
      this.ownership.read(),
    ])

    const project = state.projects.find((p) => p.id === projectId)
    if (!project) {
      throw new Error('That project no longer exists.')
    }

    const reconciled = reconcileOwnership(state, rawTabs, entries)
    const eligibleTabs = reconciled.tabs.filter((tab) => isFileable(tab, this.api.workspaceUrl()))

    const operationId = this.createId()
    this.preparedOperations.set(operationId, {
      operationId,
      tabId: -1, // sentinel for bulk
      projectId,
      projectName: project.name,
      capturedUrl: '',
      capturedTitle: '',
      suggestedTags: [],
    })

    return {
      operationId,
      eligible: eligibleTabs.length,
      projectName: project.name,
    }
  }

  async executeBulkFiling(
    operationId: string,
    projectId: string,
    windowId: number,
  ): Promise<FilingSummary> {
    this.preparedOperations.delete(operationId)

    const summary: FilingSummary = {
      eligible: 0,
      created: 0,
      reused: 0,
      alreadyClosed: 0,
      closeRequested: 0,
      surviving: 0,
      skipped: [],
      failed: [],
    }

    // Step 1: Query and reconcile fresh inventory
    const [state, rawTabs, entries] = await Promise.all([
      this.readState(),
      queryOrdinaryTabs(this.api, windowId),
      this.ownership.read(),
    ])

    const reconciled = reconcileOwnership(state, rawTabs, entries)
    const eligibleTabs = reconciled.tabs
      .filter((tab) => isFileable(tab, this.api.workspaceUrl()))
      .sort((a, b) => a.index - b.index)

    summary.eligible = eligibleTabs.length

    // Step 2: Process each tab independently
    for (const tab of eligibleTabs) {
      const itemResult = await this.fileBulkItem(tab, projectId, windowId)

      switch (itemResult.closeState) {
        case 'closed':
          if (itemResult.filing === 'created') summary.created++
          else summary.reused++
          summary.alreadyClosed++
          break
        case 'requested':
          if (itemResult.filing === 'created') summary.created++
          else summary.reused++
          summary.closeRequested++
          break
        case 'skipped':
          summary.skipped.push({ tabId: tab.tabId, reason: 'url-changed' })
          break
        case 'failed':
          summary.failed.push({
            tabId: tab.tabId,
            stage: 'close',
            message: itemResult.error ?? 'Unknown error',
          })
          break
      }
    }

    this.onEvent({ type: 'summary', summary })
    this.onInventoryChange()
    return summary
  }

  private async fileBulkItem(
    tab: LiveTabView,
    projectId: string,
    windowId: number,
  ): Promise<FilingResult> {
    const operationId = this.createId()
    const tabId = tab.tabId
    const persistedUrl = tab.url!
    const capturedTitle = prepareTitle(tab)
    const suggestedTags = suggestTags(tab.hostname ?? '')

    // Persist
    try {
      const { meta } = await this.durableQueue.execute({
        type: 'FILE_LIVE_TAB',
        projectId,
        url: persistedUrl,
        capturedTitle,
        suggestedTags,
      })

      const savedUrlId = meta.affectedSavedUrlId!
      const filing = meta.filing!

      // Tab disappeared after persist?
      const tabAfterPersist = await this.api.get(tabId).catch(() => null)
      if (!tabAfterPersist) {
        return { operationId, tabId, projectId, savedUrlId, filing, closeState: 'closed' }
      }

      // URL recheck
      if (tabAfterPersist.url && tabAfterPersist.url !== persistedUrl) {
        return { operationId, tabId, projectId, savedUrlId, filing, closeState: 'skipped' }
      }

      // Ownership
      try {
        await this.ownership.update((current) => [
          ...current.filter((entry) => entry.tabId !== tabId),
          { tabId, windowId, projectId, savedUrlId, establishedUrl: persistedUrl },
        ])
      } catch {
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'failed',
          error: 'Ownership failed.',
        }
      }

      // Close tracking
      await this.closeTracker.set({
        operationId,
        tabId,
        windowId,
        projectId,
        savedUrlId,
        persistedUrl,
        requestedAt: Date.now(),
        state: 'requested',
      })

      // Check protection before close
      const protection = await this.checkProtection(tabId)
      if (protection.protected) {
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'skipped',
          error: `Protected: ${protection.reasons.join(', ')}. Not closed.`,
        }
      }

      // Close request
      try {
        await this.api.remove(tabId)
        return { operationId, tabId, projectId, savedUrlId, filing, closeState: 'requested' }
      } catch {
        await this.closeTracker.updateState(operationId, 'failed', 'Close rejected.')
        return {
          operationId,
          tabId,
          projectId,
          savedUrlId,
          filing,
          closeState: 'failed',
          error: 'Close rejected.',
        }
      }
    } catch (error) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId: '',
        filing: 'created',
        closeState: 'failed',
        error: error instanceof Error ? error.message : 'Persistence failed.',
      }
    }
  }

  async retryClose(
    operationId: string,
    windowId: number,
  ): Promise<FilingResult> {
    const attempt = await this.closeTracker.readByOperationId(operationId)
    if (!attempt) {
      throw new Error('No close attempt found for this operation.')
    }

    const { tabId, projectId, savedUrlId, persistedUrl } = attempt

    // Revalidate tab
    const tab = await this.api.get(tabId).catch(() => null)
    if (!tab) {
      // Tab disappeared — resolve attention
      await this.closeTracker.remove(operationId)
      this.onInventoryChange()
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'closed',
      }
    }

    if (tab.windowId !== windowId) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'skipped',
        error: 'Tab moved to another window.',
      }
    }

    // URL recheck before retry
    if (tab.url && tab.url !== persistedUrl) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'skipped',
        error: 'URL changed — file again if needed.',
      }
    }

    // Check protection before retry
    const protection = await this.checkProtection(tabId)
    if (protection.protected) {
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'skipped',
        error: `Protected: ${protection.reasons.join(', ')}. Not closed.`,
      }
    }

    // Update tracker state
    await this.closeTracker.updateState(operationId, 'requested')

    // Issue close request
    try {
      await this.api.remove(tabId)
      this.onInventoryChange()
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'requested',
      }
    } catch (error) {
      await this.closeTracker.updateState(
        operationId,
        'failed',
        error instanceof Error ? error.message : 'Close request rejected.',
      )
      this.onInventoryChange()
      return {
        operationId,
        tabId,
        projectId,
        savedUrlId,
        filing: 'reused',
        closeState: 'failed',
        error: 'Chrome rejected the close request.',
      }
    }
  }

  resolveTabRemoval(tabId: number): void {
    void this.closeTracker.resolveByTabId(tabId)
  }

  getPreparedOperation(operationId: string): PreparedFilingOperation | undefined {
    return this.preparedOperations.get(operationId)
  }

  async checkProtection(tabId: number): Promise<CloseProtectionDecision> {
    if (!this.protectedTabsStore) return { protected: false, reasons: [] }
    return checkCloseProtection(tabId, this.api, this.protectedTabsStore)
  }
}
