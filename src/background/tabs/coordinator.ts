import type { PersistedStateV1 } from '../../domain/types'
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

  constructor(
    private readonly api: ChromeTabsApi,
    private readonly ownership?: OwnershipStore,
    private readonly readState: () => Promise<PersistedStateV1> = async () => ({ schemaVersion: 1, projects: [] }),
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
      if (this.ownership) {
        const [state, entries] = await Promise.all([this.readState(), this.ownership.read()])
        const reconciled = reconcileOwnership(state, rawTabs, entries)
        tabs = reconciled.tabs
        const validIds = new Set(reconciled.ownership.map((entry) => entry.tabId))
        if (entries.some((entry) => !validIds.has(entry.tabId)) || reconciled.ownership.some((entry) => entries.find((current) => current.tabId === entry.tabId)?.windowId !== entry.windowId)) {
          await this.ownership.replace(reconciled.ownership)
        }
      }
      const inventory: LiveTabInventory = { windowId, tabs, stale: false }
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
