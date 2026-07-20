import type { PersistedStateV1 } from '../../domain/types'
import type { CommandQueue } from '../../storage/commandQueue'
import { reconcileOwnership } from '../../domain/ownership'
import type { LiveTabInventory } from '../../domain/liveTabs'
import { LIVE_TAB_PORT, type LiveTabMessage, type LiveTabRequest } from '../messages'
import { queryOrdinaryTabs, type ChromeTabsApi } from './chromeTabs'
import type { OwnershipStore } from './ownershipStore'

interface ClientSubscription {
  workspaceTabId: number
  windowId: number
  port: chrome.runtime.Port
  lastInventory?: LiveTabInventory
}

export class LiveTabsCoordinator {
  private readonly clients = new Map<number, ClientSubscription>()
  private readonly refreshQueued = new Set<number>()
  private readonly operationTails = new Map<number, Promise<void>>()
  private readonly reconciledWindows = new Set<number>()

  constructor(
    private readonly api: ChromeTabsApi,
    private readonly ownership?: OwnershipStore,
    private readonly readState: () => Promise<PersistedStateV1> = async () => ({ schemaVersion: 1, projects: [] }),
    private readonly durableQueue?: CommandQueue,
  ) {}

  connect(port: chrome.runtime.Port): void {
    if (port.name !== LIVE_TAB_PORT) return
    const senderTab = port.sender?.tab
    if (senderTab?.id === undefined || senderTab.windowId === undefined || senderTab.url !== this.api.workspaceUrl()) {
      port.disconnect()
      return
    }
    const client: ClientSubscription = { workspaceTabId: senderTab.id, windowId: senderTab.windowId, port }
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
