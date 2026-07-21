import type { PersistedState } from '../../domain/types'
import type { CommandQueue } from '../../storage/commandQueue'
import { reconcileOwnership } from '../../domain/ownership'
import type { LiveTabInventory } from '../../domain/liveTabs'
import { LIVE_TAB_PORT, type LiveTabMessage, type LiveTabRequest } from '../messages'
import { queryOrdinaryTabs, type ChromeTabsApi } from './chromeTabs'
import type { OwnershipStore } from './ownershipStore'
import type { CloseTrackerStore } from './closeTracker'
import type { FilingOrchestrator } from './filing'
import type { ActiveProjectStore } from './activeProjectStore'

interface ClientSubscription {
  workspaceTabId: number
  windowId: number
  port: chrome.runtime.Port
  lastInventory?: LiveTabInventory
  selectedProjectId?: string
  activeProjectId?: string
}

export class LiveTabsCoordinator {
  private readonly clients = new Map<number, ClientSubscription>()
  private readonly refreshQueued = new Set<number>()
  private readonly operationTails = new Map<number, Promise<void>>()
  private readonly reconciledWindows = new Set<number>()

  constructor(
    private readonly api: ChromeTabsApi,
    private readonly ownership?: OwnershipStore,
    private readonly readState: () => Promise<PersistedState> = async () => ({ schemaVersion: 2, projects: [] }),
    private readonly durableQueue?: CommandQueue,
    private readonly closeTracker?: CloseTrackerStore,
    private readonly filingOrchestrator?: FilingOrchestrator,
    private readonly activeProjectStore?: ActiveProjectStore,
  ) {}

  async connect(port: chrome.runtime.Port): Promise<void> {
    if (port.name !== LIVE_TAB_PORT) return
    const senderTab = port.sender?.tab
    if (senderTab?.id === undefined || senderTab.windowId === undefined || senderTab.url !== this.api.workspaceUrl()) {
      port.disconnect()
      return
    }
    const activeProjectId = this.activeProjectStore ? await this.activeProjectStore.getActiveProject(senderTab.windowId) : undefined
    const client: ClientSubscription = { workspaceTabId: senderTab.id, windowId: senderTab.windowId, port, activeProjectId }
    this.clients.set(senderTab.id, client)
    port.onMessage.addListener((message: unknown) => void this.onMessage(client, message))
    port.onDisconnect.addListener(() => this.clients.delete(client.workspaceTabId))
    void this.refreshWindow(client.windowId)
  }

  scheduleWindow(windowId: number): void {
    if (!this.hasWindow(windowId) || this.refreshQueued.has(windowId)) return
    this.refreshQueued.add(windowId)
    queueMicrotask(() => {
      this.refreshQueued.delete(windowId)
      void this.refreshWindow(windowId)
    })
  }

  scheduleAll(): void {
    new Set(Array.from(this.clients.values(), (client) => client.windowId)).forEach((windowId) => this.scheduleWindow(windowId))
  }

  async refreshWindow(windowId: number): Promise<void> {
    const subscribers = this.forWindow(windowId)
    if (subscribers.length === 0) return
    try {
      const rawTabs = await queryOrdinaryTabs(this.api, windowId)
      let tabs = rawTabs
      let reconciliation: LiveTabInventory['reconciliation']
      if (this.ownership) {
        const [state, entries] = await Promise.all([this.readState(), this.ownership.read()])
        const reconciled = reconcileOwnership(state, rawTabs, entries)
        tabs = reconciled.tabs
        const nextById = new Map(reconciled.ownership.map((entry) => [entry.tabId, entry]))
        const ownershipChanged = entries.length !== reconciled.ownership.length || entries.some((entry) => JSON.stringify(entry) !== JSON.stringify(nextById.get(entry.tabId)))
        if (ownershipChanged) await this.ownership.replace(reconciled.ownership)
        if (!this.reconciledWindows.has(windowId)) {
          this.reconciledWindows.add(windowId)
          if (reconciled.matched || reconciled.ambiguous) reconciliation = { matched: reconciled.matched, ambiguous: reconciled.ambiguous }
        }
      }
      const inventory: LiveTabInventory = { windowId, tabs, stale: false, reconciliation }
      subscribers.forEach((client) => {
        client.lastInventory = inventory
        this.post(client, { kind: 'LIVE_TAB_INVENTORY', inventory })
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Chrome could not provide the current tabs.'
      subscribers.forEach((client) => {
        const inventory: LiveTabInventory = {
          windowId,
          tabs: client.lastInventory?.tabs ?? [],
          stale: true,
          error: message,
        }
        this.post(client, { kind: 'LIVE_TAB_INVENTORY', inventory })
      })
    }
  }

  private async onMessage(client: ClientSubscription, value: unknown): Promise<void> {
    const message = value as Partial<LiveTabRequest>
    if (message.kind === 'RETRY_TAB_INVENTORY') {
      await this.refreshWindow(client.windowId)
      return
    }
    if (message.kind === 'ASSIGN_LIVE_TAB' && typeof message.tabId === 'number' && typeof message.projectId === 'string' && typeof message.savedUrlId === 'string') {
      await this.assign(client, message.tabId, message.projectId, message.savedUrlId)
      return
    }
    if (message.kind === 'OPEN_SAVED_URL' && typeof message.projectId === 'string' && typeof message.savedUrlId === 'string') {
      this.enqueueWindow(client.windowId, () => this.open(client, message.projectId!, message.savedUrlId!))
      return
    }
    if (message.kind === 'OPEN_SAVED_URL_COPY' && typeof message.projectId === 'string' && typeof message.savedUrlId === 'string') {
      this.enqueueWindow(client.windowId, () => this.openCopy(client, message.projectId!, message.savedUrlId!))
      return
    }
    if (message.kind === 'DELETE_PROJECT_WITH_LIVE_TABS' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.deleteProject(client, message.projectId!))
      return
    }
    if (message.kind === 'PREPARE_FILE_LIVE_TAB' && typeof message.tabId === 'number' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.prepareFileTab(client, message.tabId!, message.projectId!))
      return
    }
    if (message.kind === 'CONFIRM_FILE_LIVE_TAB' && typeof message.operationId === 'string') {
      this.enqueueWindow(client.windowId, () => this.confirmFileTab(client, message.operationId!))
      return
    }
    if (message.kind === 'CANCEL_FILE_OPERATION' && typeof message.operationId === 'string') {
      // Clean up prepared operation, no side effects
      return
    }
    if (message.kind === 'RETRY_FILE_OPERATION' && typeof message.operationId === 'string') {
      this.enqueueWindow(client.windowId, () => this.retryFileOperation(client, message.operationId!))
      return
    }
    if (message.kind === 'PREPARE_FILE_ALL_UNASSIGNED' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.prepareBulkFile(client, message.projectId!))
      return
    }
    if (message.kind === 'CONFIRM_FILE_ALL_UNASSIGNED' && typeof message.operationId === 'string') {
      this.enqueueWindow(client.windowId, () => this.confirmBulkFile(client, message.operationId!, message.projectId!))
      return
    }
    // Phase 4: Activate project
    if (message.kind === 'PREPARE_ACTIVATE_PROJECT' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.prepareActivateProject(client, message.projectId!))
      return
    }
    if (message.kind === 'CONFIRM_ACTIVATE_PROJECT' && typeof message.operationId === 'string') {
      this.enqueueWindow(client.windowId, () => this.confirmActivateProject(client, message.operationId!))
      return
    }
    if (message.kind === 'CANCEL_ACTIVATE_PROJECT' && typeof message.operationId === 'string') {
      // Clean up prepared operation, no side effects
      return
    }
    // Phase 4: Open all
    if (message.kind === 'OPEN_ALL_PROJECT_URLS' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.openAllProjectUrls(client, message.projectId!))
      return
    }
    // Phase 4: Close all
    if (message.kind === 'PREPARE_CLOSE_ALL_PROJECT_TABS' && typeof message.projectId === 'string') {
      this.enqueueWindow(client.windowId, () => this.prepareCloseAllProjectTabs(client, message.projectId!))
      return
    }
    if (message.kind === 'CONFIRM_CLOSE_ALL_PROJECT_TABS' && typeof message.operationId === 'string') {
      this.enqueueWindow(client.windowId, () => this.confirmCloseAllProjectTabs(client, message.operationId!))
      return
    }
    if (message.kind === 'CANCEL_CLOSE_ALL_PROJECT_TABS' && typeof message.operationId === 'string') {
      // Clean up prepared operation, no side effects
      return
    }
    if (message.kind !== 'FOCUS_LIVE_TAB' || typeof message.tabId !== 'number') return
    try {
      const tab = await this.api.get(message.tabId)
      if (tab.windowId !== client.windowId) throw new Error('That tab moved to another Chrome window.')
      await this.api.focusWindow(client.windowId)
      await this.api.activate(message.tabId)
      this.scheduleWindow(client.windowId)
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        tabId: message.tabId,
        message: reason instanceof Error ? reason.message : 'Chrome could not focus that tab.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  private async deleteProject(client: ClientSubscription, projectId: string): Promise<void> {
    if (!this.durableQueue || !this.ownership) return
    try {
      const { state } = await this.durableQueue.execute({ type: 'DELETE_PROJECT', projectId })
      this.post(client, { kind: 'PROJECT_DELETED', projectId, state })
      await chrome.runtime.sendMessage({ channel: 'protab', kind: 'STATE_COMMITTED', state }).catch(() => undefined)
      try {
        await this.ownership.update((entries) => entries.filter((entry) => entry.projectId !== projectId))
      } catch (error) {
        console.error('Protab deleted a project but could not immediately clear its live ownership.', { projectId, error })
      }
      this.scheduleAll()
    } catch (reason) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', message: reason instanceof Error ? reason.message : 'Protab could not delete that project.' })
    }
  }

  private async openCopy(client: ClientSubscription, projectId: string, savedUrlId: string): Promise<void> {
    if (!this.ownership) return
    try {
      const state = await this.readState()
      const project = state.projects.find((candidate) => candidate.id === projectId)
      const record = project?.savedUrls.find((candidate) => candidate.id === savedUrlId)
      if (!project || !record) throw new Error('That saved URL no longer exists.')
      const created = await this.api.create(client.windowId, record.url)
      if (created.id === undefined) throw new Error('Chrome opened the page without returning a tab identity.')
      try {
        await this.ownership.update((current) => [...current.filter((entry) => entry.tabId !== created.id), { tabId: created.id!, windowId: client.windowId, projectId, savedUrlId, establishedUrl: record.url }])
      } catch {
        throw new Error(`Another copy of “${record.title}” opened, but Protab could not mark it as owned.`)
      }
      await this.refreshWindow(client.windowId)
    } catch (reason) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', message: reason instanceof Error ? reason.message : 'Protab could not open another copy.' })
      this.scheduleWindow(client.windowId)
    }
  }

  private async open(client: ClientSubscription, projectId: string, savedUrlId: string): Promise<void> {
    if (!this.ownership) return
    try {
      const state = await this.readState()
      const project = state.projects.find((candidate) => candidate.id === projectId)
      const record = project?.savedUrls.find((candidate) => candidate.id === savedUrlId)
      if (!project || !record) throw new Error('That saved URL no longer exists.')
      const rawTabs = await queryOrdinaryTabs(this.api, client.windowId)
      const entries = await this.ownership.read()
      const inventory = reconcileOwnership(state, rawTabs, entries).tabs
      const rawById = new Map((await this.api.query(client.windowId)).map((tab) => [tab.id, tab]))
      const owned = inventory.filter((tab) => tab.ownership?.projectId === projectId && tab.ownership.savedUrlId === savedUrlId && !tab.ownership.drifted && tab.url === record.url)
      const selected = owned.sort((left, right) => {
        const leftAccessed = rawById.get(left.tabId)?.lastAccessed ?? -1
        const rightAccessed = rawById.get(right.tabId)?.lastAccessed ?? -1
        return rightAccessed - leftAccessed || right.tabId - left.tabId
      })[0]
      if (selected) {
        await this.api.focusWindow(client.windowId)
        await this.api.activate(selected.tabId)
        this.scheduleWindow(client.windowId)
        return
      }
      const reusable = inventory.find((tab) => !tab.ownership && tab.url === record.url && tab.candidates.length === 1 && tab.candidates[0].projectId === projectId && tab.candidates[0].savedUrlId === savedUrlId)
      if (reusable) {
        await this.ownership.update((current) => [...current.filter((entry) => entry.tabId !== reusable.tabId), { tabId: reusable.tabId, windowId: client.windowId, projectId, savedUrlId, establishedUrl: record.url }])
        await this.api.focusWindow(client.windowId)
        await this.api.activate(reusable.tabId)
        await this.refreshWindow(client.windowId)
        return
      }
      const created = await this.api.create(client.windowId, record.url)
      if (created.id === undefined) throw new Error('Chrome opened the page without returning a tab identity.')
      try {
        await this.ownership.update((current) => [...current.filter((entry) => entry.tabId !== created.id), { tabId: created.id!, windowId: client.windowId, projectId, savedUrlId, establishedUrl: record.url }])
      } catch {
        throw new Error(`“${record.title}” opened, but Protab could not mark it as owned.`)
      }
      await this.refreshWindow(client.windowId)
    } catch (reason) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', message: reason instanceof Error ? reason.message : 'Protab could not open that saved URL.' })
      this.scheduleWindow(client.windowId)
    }
  }

  private async prepareFileTab(client: ClientSubscription, tabId: number, projectId: string): Promise<void> {
    if (!this.filingOrchestrator) return
    try {
      const operation = await this.filingOrchestrator.prepare(tabId, projectId, client.windowId)
      this.post(client, { kind: 'FILING_PREPARED', operation })
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        tabId,
        message: reason instanceof Error ? reason.message : 'Could not prepare filing.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  private async confirmFileTab(client: ClientSubscription, operationId: string): Promise<void> {
    if (!this.filingOrchestrator) return
    try {
      const result = await this.filingOrchestrator.executeFiling(operationId, client.windowId)
      this.post(client, { kind: 'FILING_RESULT', result })
      await chrome.runtime.sendMessage({ channel: 'protab', kind: 'STATE_COMMITTED', state: await this.readState() }).catch(() => undefined)
      this.scheduleWindow(client.windowId)
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not complete filing.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  private async retryFileOperation(client: ClientSubscription, operationId: string): Promise<void> {
    if (!this.filingOrchestrator) return
    try {
      const result = await this.filingOrchestrator.retryClose(operationId, client.windowId)
      this.post(client, { kind: 'FILING_RESULT', result })
      this.scheduleWindow(client.windowId)
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not retry close.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  private async prepareBulkFile(client: ClientSubscription, projectId: string): Promise<void> {
    if (!this.filingOrchestrator) return
    try {
      const { operationId, eligible, projectName } = await this.filingOrchestrator.prepareBulk(projectId, client.windowId)
      this.post(client, { kind: 'BULK_FILING_PREPARED', operationId, eligible, projectName })
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not prepare bulk filing.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  private async confirmBulkFile(client: ClientSubscription, operationId: string, projectId: string): Promise<void> {
    if (!this.filingOrchestrator) return
    try {
      const summary = await this.filingOrchestrator.executeBulkFiling(operationId, projectId, client.windowId)
      this.post(client, { kind: 'FILING_SUMMARY', summary })
      await chrome.runtime.sendMessage({ channel: 'protab', kind: 'STATE_COMMITTED', state: await this.readState() }).catch(() => undefined)
      this.scheduleWindow(client.windowId)
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not complete bulk filing.',
      })
      this.scheduleWindow(client.windowId)
    }
  }

  resolveTabRemoval(tabId: number): void {
    if (this.filingOrchestrator) {
      this.filingOrchestrator.resolveTabRemoval(tabId)
    }
  }

  async restoreActiveState(): Promise<void> {
    if (!this.activeProjectStore) return
    const restored = await this.activeProjectStore.restoreActiveState(
      async (windowId) => {
        try {
          await this.api.focusWindow(windowId)
          return true
        } catch {
          return false
        }
      },
      (projectId) => {
        const state = this.cachedState
        return state ? state.projects.some((p) => p.id === projectId) : false
      },
    )
    for (const client of this.clients.values()) {
      const activeProjectId = restored.get(client.windowId)
      if (activeProjectId) {
        client.activeProjectId = activeProjectId
      }
    }
  }

  private cachedState?: PersistedState

  async initialize(state: PersistedState): Promise<void> {
    this.cachedState = state
    await this.restoreActiveState()
  }

  updateCachedState(state: PersistedState): void {
    this.cachedState = state
  }

  private enqueueWindow(windowId: number, operation: () => Promise<void>): void {
    const previous = this.operationTails.get(windowId) ?? Promise.resolve()
    const next = previous.then(operation, operation)
    this.operationTails.set(windowId, next.then(() => undefined, () => undefined))
  }

  private async assign(client: ClientSubscription, tabId: number, projectId: string, savedUrlId: string): Promise<void> {
    if (!this.ownership) return
    try {
      const [tab, state] = await Promise.all([this.api.get(tabId), this.readState()])
      if (tab.windowId !== client.windowId) throw new Error('That tab moved to another Chrome window.')
      const normalized = (await queryOrdinaryTabs(this.api, client.windowId)).find((candidate) => candidate.tabId === tabId)
      if (!normalized) throw new Error('That tab is no longer available.')
      if (!normalized.supported || !normalized.url) throw new Error('This page cannot be assigned.')
      const candidates = reconcileOwnership(state, [normalized], []).tabs[0].candidates
      if (!candidates.some((candidate) => candidate.projectId === projectId && candidate.savedUrlId === savedUrlId)) throw new Error('That assignment option is no longer available.')
      await this.ownership.update((entries) => [...entries.filter((entry) => entry.tabId !== tabId), { tabId, windowId: client.windowId, projectId, savedUrlId, establishedUrl: normalized.url! }])
      await this.refreshWindow(client.windowId)
    } catch (reason) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', tabId, message: reason instanceof Error ? reason.message : 'Protab could not assign that tab.' })
      this.scheduleWindow(client.windowId)
    }
  }

  // Phase 4: Prepare activate project
  private async prepareActivateProject(client: ClientSubscription, projectId: string): Promise<void> {
    try {
      const [state, rawTabs, entries] = await Promise.all([
        this.readState(),
        queryOrdinaryTabs(this.api, client.windowId),
        this.ownership?.read() ?? Promise.resolve([]),
      ])

      const project = state.projects.find((p) => p.id === projectId)
      if (!project) {
        throw new Error('That project no longer exists.')
      }

      const reconciled = reconcileOwnership(state, rawTabs, entries)
      const tabs = reconciled.tabs

      // Find tabs owned by other projects
      const otherProjectTabs = tabs.filter(
        (tab) => tab.ownership && tab.ownership.projectId !== projectId && !tab.ownership.drifted
      )

      // Find drifted tabs with provenance pointing to other projects
      const driftedTabs = tabs
        .filter((tab) => {
          if (!tab.ownership?.drifted) return false
          // Check if the ownership entry points to another project
          const entry = entries.find((e) => e.tabId === tab.tabId)
          return entry && entry.projectId !== projectId
        })
        .map((tab) => {
          const entry = entries.find((e) => e.tabId === tab.tabId)
          return {
            tabId: tab.tabId,
            savedUrl: entry?.establishedUrl ?? '',
            currentUrl: tab.url ?? '',
          }
        })

      // Count unassigned tabs
      const unassignedCount = tabs.filter((tab) => !tab.ownership || tab.ownership.drifted).length

      const operationId = crypto.randomUUID()
      const operation = {
        operationId,
        projectId,
        projectName: project.name,
        otherProjectTabs: otherProjectTabs.length,
        driftedTabs,
        unassignedCount,
      }

      // Store the prepared operation
      this.preparedActivateOperations.set(operationId, { ...operation, otherProjectTabIds: otherProjectTabs.map((t) => t.tabId) })

      this.post(client, { kind: 'ACTIVATION_PREPARED', operation })
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not prepare activation.',
      })
    }
  }

  private preparedActivateOperations = new Map<string, { operationId: string; projectId: string; projectName: string; otherProjectTabIds: number[]; unassignedCount: number }>()

  // Phase 4: Confirm activate project
  private async confirmActivateProject(client: ClientSubscription, operationId: string): Promise<void> {
    const prepared = this.preparedActivateOperations.get(operationId)
    if (!prepared) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', message: 'This operation is no longer valid. Please try again.' })
      return
    }

    this.preparedActivateOperations.delete(operationId)
    // Update cached state
    this.cachedState = await this.readState()
    const { projectId, otherProjectTabIds, unassignedCount } = prepared

    const summary = {
      projectId,
      total: otherProjectTabIds.length,
      closed: 0,
      requested: 0,
      kept: 0,
      surviving: 0,
      skipped: [] as Array<{ tabId: number; reason: string }>,
      failed: [] as Array<{ tabId: number; message: string }>,
      unassignedCount,
    }

    // Process each tab
    for (const tabId of otherProjectTabIds) {
      try {
        // Re-read tab
        const tab = await this.api.get(tabId).catch(() => null)
        if (!tab) {
          summary.skipped.push({ tabId, reason: 'Tab disappeared.' })
          continue
        }

        if (tab.windowId !== client.windowId) {
          summary.skipped.push({ tabId, reason: 'Tab moved to another window.' })
          continue
        }

        // URL recheck
        const rawTabs = await queryOrdinaryTabs(this.api, client.windowId)
        const currentTab = rawTabs.find((t) => t.tabId === tabId)
        if (!currentTab) {
          summary.skipped.push({ tabId, reason: 'Tab no longer available.' })
          continue
        }

        // Register close tracking
        if (this.closeTracker) {
          await this.closeTracker.set({
            operationId: crypto.randomUUID(),
            tabId,
            windowId: client.windowId,
            projectId,
            savedUrlId: '',
            persistedUrl: currentTab.url ?? '',
            requestedAt: Date.now(),
            state: 'requested',
          })
        }

        // Issue close
        try {
          await this.api.remove(tabId)
          summary.requested++
        } catch (error) {
          summary.failed.push({
            tabId,
            message: error instanceof Error ? error.message : 'Chrome rejected the close request.',
          })
        }
      } catch (error) {
        summary.failed.push({
          tabId,
          message: error instanceof Error ? error.message : 'Unknown error.',
        })
      }
    }

    // Set active project
    if (this.activeProjectStore) {
      await this.activeProjectStore.setActiveProject(client.windowId, projectId)
    }
    client.activeProjectId = projectId

    // Open saved URLs that aren't already open (no duplicates)
    const state = await this.readState()
    const project = state.projects.find((p) => p.id === projectId)
    if (project) {
      const rawTabs = await queryOrdinaryTabs(this.api, client.windowId)
      const entries = this.ownership ? await this.ownership.read() : []
      const reconciled = reconcileOwnership(state, rawTabs, entries)

      for (const record of project.savedUrls) {
        // Check if already open and owned by this project
        const alreadyOpen = reconciled.tabs.some(
          (tab) =>
            tab.ownership?.projectId === projectId &&
            tab.ownership.savedUrlId === record.id &&
            !tab.ownership.drifted &&
            tab.url === record.url
        )
        if (alreadyOpen) continue

        // Create new tab
        try {
          const created = await this.api.create(client.windowId, record.url)
          if (created.id === undefined) continue

          // Establish ownership
          if (this.ownership) {
            await this.ownership.update((current) => [
              ...current.filter((entry) => entry.tabId !== created.id),
              {
                tabId: created.id!,
                windowId: client.windowId,
                projectId,
                savedUrlId: record.id,
                establishedUrl: record.url,
              },
            ])
          }
        } catch {
          // Continue after individual failures
        }
      }
    }

    // Refocus the workspace tab so the user stays on the extension page
    try {
      await this.api.focusWindow(client.windowId)
      await this.api.activate(client.workspaceTabId)
    } catch {
      // Workspace tab may have closed; continue anyway
    }

    // Post summary
    this.post(client, { kind: 'ACTIVATION_SUMMARY', summary })

    // Refresh inventory
    await this.refreshWindow(client.windowId)
  }

  // Phase 4: Open all project URLs
  private async openAllProjectUrls(client: ClientSubscription, projectId: string): Promise<void> {
    const summary = {
      total: 0,
      focused: 0,
      created: 0,
      failed: [] as Array<{ savedUrlId: string; message: string }>,
    }

    try {
      const state = await this.readState()
      const project = state.projects.find((p) => p.id === projectId)
      if (!project) {
        throw new Error('That project no longer exists.')
      }

      summary.total = project.savedUrls.length

      for (const record of project.savedUrls) {
        try {
          // Check if already open and owned
          const rawTabs = await queryOrdinaryTabs(this.api, client.windowId)
          const entries = this.ownership ? await this.ownership.read() : []
          const reconciled = reconcileOwnership(state, rawTabs, entries)
          const rawById = new Map((await this.api.query(client.windowId)).map((tab) => [tab.id, tab]))

          const owned = reconciled.tabs.filter(
            (tab) =>
              tab.ownership?.projectId === projectId &&
              tab.ownership.savedUrlId === record.id &&
              !tab.ownership.drifted &&
              tab.url === record.url
          )

          if (owned.length > 0) {
            // Focus most recently accessed
            const selected = owned.sort((left, right) => {
              const leftAccessed = rawById.get(left.tabId)?.lastAccessed ?? -1
              const rightAccessed = rawById.get(right.tabId)?.lastAccessed ?? -1
              return rightAccessed - leftAccessed || right.tabId - left.tabId
            })[0]
            await this.api.focusWindow(client.windowId)
            await this.api.activate(selected.tabId)
            summary.focused++
            continue
          }

          // Create new tab
          const created = await this.api.create(client.windowId, record.url)
          if (created.id === undefined) {
            throw new Error('Chrome opened the page without returning a tab identity.')
          }

          // Establish ownership
          if (this.ownership) {
            await this.ownership.update((current) => [
              ...current.filter((entry) => entry.tabId !== created.id),
              {
                tabId: created.id!,
                windowId: client.windowId,
                projectId,
                savedUrlId: record.id,
                establishedUrl: record.url,
              },
            ])
          }

          summary.created++
        } catch (error) {
          summary.failed.push({
            savedUrlId: record.id,
            message: error instanceof Error ? error.message : 'Could not open this URL.',
          })
        }
      }

      this.post(client, { kind: 'OPEN_ALL_SUMMARY', summary })
      await this.refreshWindow(client.windowId)
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not open all URLs.',
      })
    }
  }

  private preparedCloseAllOperations = new Map<string, { operationId: string; projectId: string; projectName: string; targetTabIds: number[] }>()

  // Phase 4: Prepare close all project tabs
  private async prepareCloseAllProjectTabs(client: ClientSubscription, projectId: string): Promise<void> {
    try {
      const [state, rawTabs, entries] = await Promise.all([
        this.readState(),
        queryOrdinaryTabs(this.api, client.windowId),
        this.ownership?.read() ?? Promise.resolve([]),
      ])

      const project = state.projects.find((p) => p.id === projectId)
      if (!project) {
        throw new Error('That project no longer exists.')
      }

      const reconciled = reconcileOwnership(state, rawTabs, entries)
      const tabs = reconciled.tabs

      // Find tabs owned by this project
      const ownedTabs = tabs.filter(
        (tab) => tab.ownership && tab.ownership.projectId === projectId && !tab.ownership.drifted
      )

      // Find drifted tabs with provenance pointing to this project
      const driftedTabs = tabs
        .filter((tab) => {
          if (!tab.ownership?.drifted) return false
          const entry = entries.find((e) => e.tabId === tab.tabId)
          return entry && entry.projectId === projectId
        })
        .map((tab) => {
          const entry = entries.find((e) => e.tabId === tab.tabId)
          return {
            tabId: tab.tabId,
            savedUrl: entry?.establishedUrl ?? '',
            currentUrl: tab.url ?? '',
          }
        })

      const operationId = crypto.randomUUID()
      this.preparedCloseAllOperations.set(operationId, {
        operationId,
        projectId,
        projectName: project.name,
        targetTabIds: ownedTabs.map((t) => t.tabId),
      })

      this.post(client, {
        kind: 'CLOSE_ALL_PREPARED',
        operationId,
        projectName: project.name,
        total: ownedTabs.length,
        driftedTabs,
      })
    } catch (reason) {
      this.post(client, {
        kind: 'LIVE_TAB_ACTION_ERROR',
        message: reason instanceof Error ? reason.message : 'Could not prepare close all.',
      })
    }
  }

  // Phase 4: Confirm close all project tabs
  private async confirmCloseAllProjectTabs(client: ClientSubscription, operationId: string): Promise<void> {
    const prepared = this.preparedCloseAllOperations.get(operationId)
    if (!prepared) {
      this.post(client, { kind: 'LIVE_TAB_ACTION_ERROR', message: 'This operation is no longer valid. Please try again.' })
      return
    }

    this.preparedCloseAllOperations.delete(operationId)
    const { projectId, targetTabIds } = prepared

    const summary = {
      total: targetTabIds.length,
      closed: 0,
      requested: 0,
      kept: 0,
      surviving: 0,
      skipped: [] as Array<{ tabId: number; reason: string }>,
      failed: [] as Array<{ tabId: number; message: string }>,
    }

    for (const tabId of targetTabIds) {
      try {
        const tab = await this.api.get(tabId).catch(() => null)
        if (!tab) {
          summary.skipped.push({ tabId, reason: 'Tab disappeared.' })
          continue
        }

        if (tab.windowId !== client.windowId) {
          summary.skipped.push({ tabId, reason: 'Tab moved to another window.' })
          continue
        }

        // URL recheck
        const rawTabs = await queryOrdinaryTabs(this.api, client.windowId)
        const currentTab = rawTabs.find((t) => t.tabId === tabId)
        if (!currentTab) {
          summary.skipped.push({ tabId, reason: 'Tab no longer available.' })
          continue
        }

        // Register close tracking
        if (this.closeTracker) {
          await this.closeTracker.set({
            operationId: crypto.randomUUID(),
            tabId,
            windowId: client.windowId,
            projectId,
            savedUrlId: '',
            persistedUrl: currentTab.url ?? '',
            requestedAt: Date.now(),
            state: 'requested',
          })
        }

        // Issue close
        try {
          await this.api.remove(tabId)
          summary.requested++
        } catch (error) {
          summary.failed.push({
            tabId,
            message: error instanceof Error ? error.message : 'Chrome rejected the close request.',
          })
        }
      } catch (error) {
        summary.failed.push({
          tabId,
          message: error instanceof Error ? error.message : 'Unknown error.',
        })
      }
    }

    // Refocus the workspace tab so the user stays on the extension page
    try {
      await this.api.focusWindow(client.windowId)
      await this.api.activate(client.workspaceTabId)
    } catch {
      // Workspace tab may have closed; continue anyway
    }

    this.post(client, { kind: 'CLOSE_ALL_SUMMARY', summary })
    await this.refreshWindow(client.windowId)
  }

  private post(client: ClientSubscription, message: LiveTabMessage): void {
    try { client.port.postMessage(message) } catch { this.clients.delete(client.workspaceTabId) }
  }

  private hasWindow(windowId: number): boolean {
    return Array.from(this.clients.values()).some((client) => client.windowId === windowId)
  }

  private forWindow(windowId: number): ClientSubscription[] {
    return Array.from(this.clients.values()).filter((client) => client.windowId === windowId)
  }
}
