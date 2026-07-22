import type { PersistedState, Project, SavedUrl } from './types'

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly existingId?: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export function validateProjectName(value: string): string {
  const name = value.trim()
  if (!name) throw new DomainError('Enter a project name.', 'PROJECT_NAME_REQUIRED')
  if (name.length > 80) throw new DomainError('Project names can be at most 80 characters.', 'PROJECT_NAME_TOO_LONG')
  return name
}

export function validateTitle(value: string): string {
  const title = value.trim()
  if (!title) throw new DomainError('Enter a title.', 'TITLE_REQUIRED')
  if (title.length > 200) throw new DomainError('Titles can be at most 200 characters.', 'TITLE_TOO_LONG')
  return title
}

export function validateNotes(value: string): string {
  if (value.length > 4_000) throw new DomainError('Notes can be at most 4,000 characters.', 'NOTES_TOO_LONG')
  return value
}

export function normalizeTags(values: string[]): string[] {
  if (values.length > 20) throw new DomainError('A URL can have at most 20 tags.', 'TOO_MANY_TAGS')
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const tag = value.trim()
    if (!tag) throw new DomainError('Tags cannot be empty.', 'TAG_REQUIRED')
    if (tag.length > 32) throw new DomainError('Tags can be at most 32 characters.', 'TAG_TOO_LONG')
    const key = tag.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      normalized.push(tag)
    }
  }
  return normalized
}

export function parseHttpUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new DomainError('Enter a valid HTTP or HTTPS URL.', 'INVALID_URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DomainError('Only HTTP and HTTPS URLs are supported.', 'UNSUPPORTED_URL')
  }
  if (parsed.username || parsed.password) {
    throw new DomainError('URLs containing a username or password are not supported.', 'URL_CREDENTIALS')
  }
  return parsed
}

export function serializeHttpUrl(value: string): string {
  return parseHttpUrl(value).href
}

export function automaticTitle(url: string): string {
  return parseHttpUrl(url).hostname
}

export function findProject(state: PersistedState, projectId: string): Project {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw new DomainError('That project no longer exists.', 'PROJECT_NOT_FOUND')
  return project
}

export function findSavedUrl(project: Project, savedUrlId: string): SavedUrl {
  const record = project.savedUrls.find((item) => item.id === savedUrlId)
  if (!record) throw new DomainError('That saved URL no longer exists.', 'SAVED_URL_NOT_FOUND')
  return record
}

export function assertUniqueUrl(project: Project, url: string, excludingId?: string): void {
  const duplicate = project.savedUrls.find((item) => item.url === url && item.id !== excludingId)
  if (duplicate) {
    throw new DomainError('This URL is already saved in the project.', 'DUPLICATE_URL', duplicate.id)
  }
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    throw new DomainError('The requested order is invalid.', 'INVALID_ORDER')
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function cloneState(state: PersistedState): PersistedState {
  return structuredClone(state)
}
