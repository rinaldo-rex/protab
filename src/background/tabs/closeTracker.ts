export interface CloseAttempt {
  operationId: string
  tabId: number
  windowId: number
  projectId: string
  savedUrlId: string
  persistedUrl: string
  requestedAt: number
  state: 'requested' | 'surviving' | 'failed'
  error?: string
}

export const CLOSE_ATTEMPTS_STORAGE_KEY = 'protab.closeAttempts.v1'

interface CloseAttemptsV1 {
  schemaVersion: 1
  attempts: Record<string, CloseAttempt>
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

function validAttempt(value: unknown): value is CloseAttempt {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<CloseAttempt>
  return (
    typeof entry.operationId === 'string' &&
    entry.operationId.length > 0 &&
    Number.isInteger(entry.tabId) &&
    Number.isInteger(entry.windowId) &&
    typeof entry.projectId === 'string' &&
    entry.projectId.length > 0 &&
    typeof entry.savedUrlId === 'string' &&
    entry.savedUrlId.length > 0 &&
    typeof entry.persistedUrl === 'string' &&
    entry.persistedUrl.length > 0 &&
    Number.isInteger(entry.requestedAt) &&
    (entry.state === 'requested' || entry.state === 'surviving' || entry.state === 'failed')
  )
}

function parse(raw: unknown): CloseAttempt[] {
  if (!raw || typeof raw !== 'object') return []
  const object = raw as Partial<CloseAttemptsV1>
  if (
    object.schemaVersion !== 1 ||
    !object.attempts ||
    typeof object.attempts !== 'object' ||
    Array.isArray(object.attempts)
  ) {
    return []
  }
  return Object.entries(object.attempts).flatMap(([key, value]) =>
    validAttempt(value) && value.operationId === key ? [value] : [],
  )
}

function serialize(attempts: CloseAttempt[]): CloseAttemptsV1 {
  return {
    schemaVersion: 1,
    attempts: Object.fromEntries(attempts.map((attempt) => [attempt.operationId, attempt])),
  }
}

export class CloseTrackerStore {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: SessionStorageAdapter) {}

  async initialize(): Promise<void> {
    await this.storage.setAccessLevel?.()
  }

  async read(): Promise<CloseAttempt[]> {
    const values = await this.storage.get(CLOSE_ATTEMPTS_STORAGE_KEY)
    return parse(values[CLOSE_ATTEMPTS_STORAGE_KEY])
  }

  async readByOperationId(operationId: string): Promise<CloseAttempt | undefined> {
    const attempts = await this.read()
    return attempts.find((attempt) => attempt.operationId === operationId)
  }

  async readByTabId(tabId: number): Promise<CloseAttempt | undefined> {
    const attempts = await this.read()
    // Return the most recent attempt for this tab
    return attempts
      .filter((attempt) => attempt.tabId === tabId)
      .sort((a, b) => b.requestedAt - a.requestedAt)[0]
  }

  set(attempt: CloseAttempt): Promise<void> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      const filtered = attempts.filter((a) => a.operationId !== attempt.operationId)
      await this.storage.set({ [CLOSE_ATTEMPTS_STORAGE_KEY]: serialize([...filtered, attempt]) })
    })
  }

  remove(operationId: string): Promise<void> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      const filtered = attempts.filter((a) => a.operationId !== operationId)
      await this.storage.set({ [CLOSE_ATTEMPTS_STORAGE_KEY]: serialize(filtered) })
    })
  }

  updateState(operationId: string, state: CloseAttempt['state'], error?: string): Promise<void> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      const updated = attempts.map((attempt) =>
        attempt.operationId === operationId
          ? { ...attempt, state, ...(error !== undefined ? { error } : {}) }
          : attempt,
      )
      await this.storage.set({ [CLOSE_ATTEMPTS_STORAGE_KEY]: serialize(updated) })
    })
  }

  resolveByTabId(tabId: number): Promise<CloseAttempt[]> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      const resolved = attempts.filter((attempt) => attempt.tabId === tabId)
      const remaining = attempts.filter((attempt) => attempt.tabId !== tabId)
      if (resolved.length > 0) {
        await this.storage.set({ [CLOSE_ATTEMPTS_STORAGE_KEY]: serialize(remaining) })
      }
      return resolved
    })
  }

  clearResolved(activeTabIds: Set<number>): Promise<void> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      const remaining = attempts.filter((attempt) => {
        if (attempt.state === 'failed') return true
        return activeTabIds.has(attempt.tabId)
      })
      if (remaining.length !== attempts.length) {
        await this.storage.set({ [CLOSE_ATTEMPTS_STORAGE_KEY]: serialize(remaining) })
      }
    })
  }

  getAttentionItems(): Promise<CloseAttempt[]> {
    return this.enqueue(async () => {
      const attempts = await this.read()
      return attempts.filter((attempt) => attempt.state === 'surviving' || attempt.state === 'failed')
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}
