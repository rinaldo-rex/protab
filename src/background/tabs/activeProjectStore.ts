export const ACTIVE_PROJECT_STORAGE_KEY = 'protab.activeProject.v1'

interface ActiveProjectV1 {
  schemaVersion: 1
  entries: Record<number, string> // windowId → projectId
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

function validEntry(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parse(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== 'object') return {}
  const object = raw as Partial<ActiveProjectV1>
  if (
    object.schemaVersion !== 1 ||
    !object.entries ||
    typeof object.entries !== 'object' ||
    Array.isArray(object.entries)
  ) {
    return {}
  }
  const result: Record<number, string> = {}
  for (const [key, value] of Object.entries(object.entries)) {
    const windowId = Number(key)
    if (Number.isInteger(windowId) && validEntry(value)) {
      result[windowId] = value
    }
  }
  return result
}

function serialize(entries: Record<number, string>): ActiveProjectV1 {
  return { schemaVersion: 1, entries }
}

export class ActiveProjectStore {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: SessionStorageAdapter) {}

  async initialize(): Promise<void> {
    await this.storage.setAccessLevel?.()
  }

  async read(): Promise<Record<number, string>> {
    const values = await this.storage.get(ACTIVE_PROJECT_STORAGE_KEY)
    return parse(values[ACTIVE_PROJECT_STORAGE_KEY])
  }

  async getActiveProject(windowId: number): Promise<string | undefined> {
    const entries = await this.read()
    return entries[windowId]
  }

  setActiveProject(windowId: number, projectId: string): Promise<void> {
    return this.enqueue(async () => {
      const entries = await this.read()
      entries[windowId] = projectId
      await this.storage.set({ [ACTIVE_PROJECT_STORAGE_KEY]: serialize(entries) })
    })
  }

  clearActiveProject(windowId: number): Promise<void> {
    return this.enqueue(async () => {
      const entries = await this.read()
      delete entries[windowId]
      await this.storage.set({ [ACTIVE_PROJECT_STORAGE_KEY]: serialize(entries) })
    })
  }

  async restoreActiveState(
    verifyWindow: (windowId: number) => Promise<boolean>,
    verifyProject: (projectId: string) => boolean,
  ): Promise<Map<number, string>> {
    const stored = await this.read()
    const restored = new Map<number, string>()
    for (const [windowIdStr, projectId] of Object.entries(stored)) {
      const windowId = Number(windowIdStr)
      try {
        const windowExists = await verifyWindow(windowId)
        if (!windowExists) continue
      } catch {
        continue
      }
      if (!verifyProject(projectId)) continue
      restored.set(windowId, projectId)
    }
    return restored
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}
