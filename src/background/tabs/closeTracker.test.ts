import { describe, expect, it, beforeEach } from 'vitest'
import { CloseTrackerStore, type CloseAttempt, type SessionStorageAdapter } from './closeTracker'

function createMemoryStorage(): SessionStorageAdapter & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    async get(key: string) {
      return data.has(key) ? { [key]: data.get(key) } : {}
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value)
      }
    },
  }
}

function createAttempt(overrides: Partial<CloseAttempt> = {}): CloseAttempt {
  return {
    operationId: 'op-1',
    tabId: 100,
    windowId: 1,
    projectId: 'p1',
    savedUrlId: 'u1',
    persistedUrl: 'https://example.com/',
    requestedAt: Date.now(),
    state: 'requested',
    ...overrides,
  }
}

describe('CloseTrackerStore', () => {
  let storage: ReturnType<typeof createMemoryStorage>
  let store: CloseTrackerStore

  beforeEach(() => {
    storage = createMemoryStorage()
    store = new CloseTrackerStore(storage)
  })

  it('initializes without error', async () => {
    await expect(store.initialize()).resolves.toBeUndefined()
  })

  it('reads empty array when no data exists', async () => {
    expect(await store.read()).toEqual([])
  })

  it('stores and retrieves a close attempt', async () => {
    const attempt = createAttempt()
    await store.set(attempt)
    const result = await store.read()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject(attempt)
  })

  it('reads by operation ID', async () => {
    const attempt1 = createAttempt({ operationId: 'op-1', tabId: 100 })
    const attempt2 = createAttempt({ operationId: 'op-2', tabId: 200 })
    await store.set(attempt1)
    await store.set(attempt2)
    expect(await store.readByOperationId('op-1')).toMatchObject({ tabId: 100 })
    expect(await store.readByOperationId('op-2')).toMatchObject({ tabId: 200 })
    expect(await store.readByOperationId('op-3')).toBeUndefined()
  })

  it('reads by tab ID (most recent)', async () => {
    const old = createAttempt({ operationId: 'op-1', tabId: 100, requestedAt: 1000 })
    const recent = createAttempt({ operationId: 'op-2', tabId: 100, requestedAt: 2000 })
    await store.set(old)
    await store.set(recent)
    const result = await store.readByTabId(100)
    expect(result).toMatchObject({ operationId: 'op-2' })
  })

  it('returns undefined for unknown tab ID', async () => {
    expect(await store.readByTabId(999)).toBeUndefined()
  })

  it('removes an attempt by operation ID', async () => {
    await store.set(createAttempt({ operationId: 'op-1' }))
    await store.set(createAttempt({ operationId: 'op-2' }))
    await store.remove('op-1')
    const result = await store.read()
    expect(result).toHaveLength(1)
    expect(result[0].operationId).toBe('op-2')
  })

  it('updates attempt state', async () => {
    await store.set(createAttempt({ operationId: 'op-1', state: 'requested' }))
    await store.updateState('op-1', 'surviving')
    const result = await store.readByOperationId('op-1')
    expect(result?.state).toBe('surviving')
  })

  it('updates attempt state with error', async () => {
    await store.set(createAttempt({ operationId: 'op-1', state: 'requested' }))
    await store.updateState('op-1', 'failed', 'Chrome rejected the request')
    const result = await store.readByOperationId('op-1')
    expect(result).toMatchObject({ state: 'failed', error: 'Chrome rejected the request' })
  })

  it('resolves attempts by tab ID', async () => {
    await store.set(createAttempt({ operationId: 'op-1', tabId: 100 }))
    await store.set(createAttempt({ operationId: 'op-2', tabId: 200 }))
    const resolved = await store.resolveByTabId(100)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].tabId).toBe(100)
    const remaining = await store.read()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].tabId).toBe(200)
  })

  it('returns empty array when resolving unknown tab ID', async () => {
    await store.set(createAttempt({ tabId: 100 }))
    const resolved = await store.resolveByTabId(999)
    expect(resolved).toEqual([])
    expect(await store.read()).toHaveLength(1)
  })

  it('clears resolved attempts (keeps failed and active)', async () => {
    await store.set(createAttempt({ operationId: 'op-1', tabId: 100, state: 'requested' }))
    await store.set(createAttempt({ operationId: 'op-2', tabId: 200, state: 'surviving' }))
    await store.set(createAttempt({ operationId: 'op-3', tabId: 300, state: 'failed' }))
    await store.clearResolved(new Set([100]))
    const result = await store.read()
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.operationId).sort()).toEqual(['op-1', 'op-3'])
  })

  it('returns attention items (surviving and failed)', async () => {
    await store.set(createAttempt({ operationId: 'op-1', tabId: 100, state: 'requested' }))
    await store.set(createAttempt({ operationId: 'op-2', tabId: 200, state: 'surviving' }))
    await store.set(createAttempt({ operationId: 'op-3', tabId: 300, state: 'failed' }))
    const attention = await store.getAttentionItems()
    expect(attention).toHaveLength(2)
    expect(attention.map((a) => a.state).sort()).toEqual(['failed', 'surviving'])
  })

  it('replaces existing attempt with same operation ID', async () => {
    await store.set(createAttempt({ operationId: 'op-1', state: 'requested' }))
    await store.set(createAttempt({ operationId: 'op-1', state: 'surviving' }))
    const result = await store.read()
    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('surviving')
  })

  it('serializes and deserializes correctly', async () => {
    const attempt = createAttempt({
      operationId: 'op-1',
      tabId: 42,
      windowId: 7,
      projectId: 'project-abc',
      savedUrlId: 'url-xyz',
      persistedUrl: 'https://test.example.com/path?q=1',
      requestedAt: 1234567890,
      state: 'surviving',
      error: 'Tab still open',
    })
    await store.set(attempt)
    // Create new store instance to test persistence
    const store2 = new CloseTrackerStore(storage)
    const result = await store2.readByOperationId('op-1')
    expect(result).toEqual(attempt)
  })

  it('handles corrupted storage data gracefully', async () => {
    storage.data.set('protab.closeAttempts.v1', { schemaVersion: 2, attempts: {} })
    expect(await store.read()).toEqual([])
  })

  it('handles missing schema version gracefully', async () => {
    storage.data.set('protab.closeAttempts.v1', { attempts: {} })
    expect(await store.read()).toEqual([])
  })

  it('filters invalid entries during parse', async () => {
    storage.data.set('protab.closeAttempts.v1', {
      schemaVersion: 1,
      attempts: {
        'valid': createAttempt({ operationId: 'valid', tabId: 100 }),
        'invalid': { operationId: 'invalid' },
        'mismatched': createAttempt({ operationId: 'other', tabId: 200 }),
      },
    })
    const result = await store.read()
    expect(result).toHaveLength(1)
    expect(result[0].operationId).toBe('valid')
  })
})
