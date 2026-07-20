import { emptyState, type PersistedStateV1 } from '../domain/types'
import { parsePersistedState } from './schema'

export const STORAGE_KEY = 'protab.state'

export interface StorageAdapter {
  get(): Promise<unknown | undefined>
  set(state: PersistedStateV1): Promise<void>
  subscribe?(listener: (value: unknown) => void): () => void
}

export class ChromeStorageAdapter implements StorageAdapter {
  async get(): Promise<unknown | undefined> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY]
  }

  async set(state: PersistedStateV1): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: state })
  }

  subscribe(listener: (value: unknown) => void): () => void {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEY]?.newValue !== undefined) listener(changes[STORAGE_KEY].newValue)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }
}

export async function loadState(storage: StorageAdapter): Promise<PersistedStateV1> {
  const raw = await storage.get()
  return raw === undefined ? emptyState() : parsePersistedState(raw)
}
