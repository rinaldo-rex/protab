import type { OwnershipEntry } from '../../domain/ownership'

export const OWNERSHIP_STORAGE_KEY = 'protab.liveOwnership.v1'

interface LiveOwnershipV1 {
  schemaVersion: 1
  entries: Record<string, OwnershipEntry>
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

function validEntry(value: unknown): value is OwnershipEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<OwnershipEntry>
  return Number.isInteger(entry.tabId) && Number.isInteger(entry.windowId) && typeof entry.projectId === 'string' && entry.projectId.length > 0 && typeof entry.savedUrlId === 'string' && entry.savedUrlId.length > 0 && typeof entry.establishedUrl === 'string' && entry.establishedUrl.length > 0
}

function parse(raw: unknown): OwnershipEntry[] {
  if (!raw || typeof raw !== 'object') return []
  const object = raw as Partial<LiveOwnershipV1>
  if (object.schemaVersion !== 1 || !object.entries || typeof object.entries !== 'object' || Array.isArray(object.entries)) return []
  return Object.entries(object.entries).flatMap(([key, value]) => validEntry(value) && String(value.tabId) === key ? [value] : [])
}

function serialize(entries: OwnershipEntry[]): LiveOwnershipV1 {
  return { schemaVersion: 1, entries: Object.fromEntries(entries.map((entry) => [String(entry.tabId), entry])) }
}

export class OwnershipStore {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: SessionStorageAdapter) {}

  async initialize(): Promise<void> {
    await this.storage.setAccessLevel?.()
  }

  async read(): Promise<OwnershipEntry[]> {
    const values = await this.storage.get(OWNERSHIP_STORAGE_KEY)
    return parse(values[OWNERSHIP_STORAGE_KEY])
  }

  replace(entries: OwnershipEntry[]): Promise<void> {
    return this.enqueue(async () => { await this.storage.set({ [OWNERSHIP_STORAGE_KEY]: serialize(entries) }) })
  }

  update(mutate: (entries: OwnershipEntry[]) => OwnershipEntry[]): Promise<OwnershipEntry[]> {
    return this.enqueue(async () => {
      const entries = mutate(await this.read())
      await this.storage.set({ [OWNERSHIP_STORAGE_KEY]: serialize(entries) })
      return entries
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}
