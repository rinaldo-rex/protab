export const PROTECTED_TABS_STORAGE_KEY = 'protab.protectedTabs.v1'

interface ProtectedTabsSessionV1 {
  schemaVersion: 1
  tabIds: number[]
}

export interface SessionStorageAdapter {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  setAccessLevel?(): Promise<void>
}

export class ChromeSessionStorageAdapter implements SessionStorageAdapter {
  get(key: string) { return chrome.storage.session.get(key) }
  set(items: Record<string, unknown>) { return chrome.storage.session.set(items) }
  async setAccessLevel() { await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }) }
}

function parse(raw: unknown): Set<number> {
  if (!raw || typeof raw !== 'object') return new Set()
  const object = raw as Partial<ProtectedTabsSessionV1>
  if (
    object.schemaVersion !== 1 ||
    !Array.isArray(object.tabIds)
  ) {
    return new Set()
  }
  return new Set(object.tabIds.filter((id): id is number => Number.isInteger(id)))
}

function serialize(tabIds: Set<number>): ProtectedTabsSessionV1 {
  return { schemaVersion: 1, tabIds: Array.from(tabIds) }
}

export class ProtectedTabsStore {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: SessionStorageAdapter) {}

  async initialize(): Promise<void> {
    await this.storage.setAccessLevel?.()
  }

  async read(): Promise<Set<number>> {
    const values = await this.storage.get(PROTECTED_TABS_STORAGE_KEY)
    return parse(values[PROTECTED_TABS_STORAGE_KEY])
  }

  pin(tabId: number): Promise<void> {
    return this.enqueue(async () => {
      const tabIds = await this.read()
      tabIds.add(tabId)
      await this.storage.set({ [PROTECTED_TABS_STORAGE_KEY]: serialize(tabIds) })
    })
  }

  unpin(tabId: number): Promise<void> {
    return this.enqueue(async () => {
      const tabIds = await this.read()
      tabIds.delete(tabId)
      await this.storage.set({ [PROTECTED_TABS_STORAGE_KEY]: serialize(tabIds) })
    })
  }

  toggle(tabId: number): Promise<boolean> {
    return this.enqueue(async () => {
      const tabIds = await this.read()
      const wasPinned = tabIds.has(tabId)
      if (wasPinned) {
        tabIds.delete(tabId)
      } else {
        tabIds.add(tabId)
      }
      await this.storage.set({ [PROTECTED_TABS_STORAGE_KEY]: serialize(tabIds) })
      return !wasPinned
    })
  }

  removeClosedTabs(activeTabIds: ReadonlySet<number>): Promise<void> {
    return this.enqueue(async () => {
      const tabIds = await this.read()
      let changed = false
      for (const id of tabIds) {
        if (!activeTabIds.has(id)) {
          tabIds.delete(id)
          changed = true
        }
      }
      if (changed) {
        await this.storage.set({ [PROTECTED_TABS_STORAGE_KEY]: serialize(tabIds) })
      }
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}
