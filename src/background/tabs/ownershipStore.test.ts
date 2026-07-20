import { describe, expect, it } from 'vitest'
import { OwnershipStore, OWNERSHIP_STORAGE_KEY, type SessionStorageAdapter } from './ownershipStore'

class MemorySession implements SessionStorageAdapter {
  values: Record<string, unknown> = {}
  accessConfigured = false
  async get() { return structuredClone(this.values) }
  async set(items: Record<string, unknown>) { await new Promise((resolve) => setTimeout(resolve, 1)); Object.assign(this.values, structuredClone(items)) }
  async setAccessLevel() { this.accessConfigured = true }
}

const first = { tabId: 1, windowId: 2, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://example.com/' }

describe('session ownership store', () => {
  it('validates entries and survives repository reconstruction', async () => {
    const storage = new MemorySession()
    const store = new OwnershipStore(storage)
    await store.initialize()
    await store.replace([first])
    expect(storage.accessConfigured).toBe(true)
    expect(await new OwnershipStore(storage).read()).toEqual([first])
  })

  it('discards invalid individual and whole values', async () => {
    const storage = new MemorySession()
    storage.values[OWNERSHIP_STORAGE_KEY] = { schemaVersion: 1, entries: { '1': first, bad: { tabId: 'bad' } } }
    expect(await new OwnershipStore(storage).read()).toEqual([first])
    storage.values[OWNERSHIP_STORAGE_KEY] = { schemaVersion: 8, entries: {} }
    expect(await new OwnershipStore(storage).read()).toEqual([])
  })

  it('serializes concurrent read-modify-write operations', async () => {
    const storage = new MemorySession()
    const store = new OwnershipStore(storage)
    await Promise.all([
      store.update((entries) => [...entries, first]),
      store.update((entries) => [...entries, { ...first, tabId: 2 }]),
    ])
    expect((await store.read()).map((entry) => entry.tabId)).toEqual([1, 2])
  })
})
