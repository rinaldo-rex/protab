import { describe, expect, it } from 'vitest'
import { CommandQueue } from './commandQueue'
import { MemoryStorageAdapter } from './memoryStorage'
import { loadState } from './repository'

const valid = {
  schemaVersion: 1 as const,
  projects: [{ id: 'p1', name: 'Research', savedUrls: [] }],
}

describe('versioned storage', () => {
  it('initializes absent storage without writing', async () => {
    const storage = new MemoryStorageAdapter()
    await expect(loadState(storage)).resolves.toEqual({ schemaVersion: 1, projects: [] })
    expect(storage.writes).toBe(0)
  })

  it('loads a valid V1 value as a clone', async () => {
    const storage = new MemoryStorageAdapter(valid)
    const loaded = await loadState(storage)
    expect(loaded).toEqual(valid)
    expect(loaded).not.toBe(valid)
  })

  it('rejects invalid and unsupported values without touching raw storage', async () => {
    const invalid = { schemaVersion: 1, projects: [{ id: 'p1' }] }
    const invalidStorage = new MemoryStorageAdapter(invalid)
    await expect(loadState(invalidStorage)).rejects.toMatchObject({ kind: 'invalid' })
    expect(invalidStorage.value).toEqual(invalid)
    expect(invalidStorage.writes).toBe(0)

    const future = { schemaVersion: 2, projects: [] }
    const futureStorage = new MemoryStorageAdapter(future)
    await expect(loadState(futureStorage)).rejects.toMatchObject({ kind: 'unsupported-version' })
    expect(futureStorage.value).toEqual(future)
  })

  it('does not replace committed state when a write fails', async () => {
    const storage = new MemoryStorageAdapter(valid)
    storage.failNextWrite = new Error('Quota exceeded')
    const queue = new CommandQueue(storage, () => 'p2')
    await expect(queue.execute({ type: 'CREATE_PROJECT', name: 'Second' })).rejects.toThrow('Quota exceeded')
    await expect(queue.read()).resolves.toEqual(valid)
  })

  it('serializes overlapping clients against latest committed state', async () => {
    const storage = new MemoryStorageAdapter()
    const queue = new CommandQueue(storage, (() => {
      const ids = ['p1', 'p2']
      return () => ids.shift()!
    })())
    const one = queue.execute({ type: 'CREATE_PROJECT', name: 'One' })
    const two = queue.execute({ type: 'CREATE_PROJECT', name: 'Two' })
    await Promise.all([one, two])
    await expect(queue.read()).resolves.toMatchObject({
      projects: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    })
  })
})
