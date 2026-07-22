import type { PersistedStateV1, PersistedState } from '../domain/types'
import { migrateV1ToV2 } from '../domain/migration'

export class StorageDataError extends Error {
  constructor(
    message: string,
    public readonly kind: 'invalid' | 'unsupported-version',
  ) {
    super(message)
    this.name = 'StorageDataError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateProjects(projects: unknown): void {
  if (!Array.isArray(projects)) throw new StorageDataError('Stored projects are invalid.', 'invalid')
  const projectIds = new Set<string>()
  for (const project of projects) {
    if (!isRecord(project) || typeof project.id !== 'string' || !project.id || typeof project.name !== 'string' || project.name.trim() !== project.name || !project.name || project.name.length > 80 || !Array.isArray(project.savedUrls)) {
      throw new StorageDataError('A stored project is invalid.', 'invalid')
    }
    if (projectIds.has(project.id)) throw new StorageDataError('Stored project IDs are not unique.', 'invalid')
    projectIds.add(project.id)
    const savedIds = new Set<string>()
    const urls = new Set<string>()
    for (const saved of project.savedUrls) {
      if (!isRecord(saved) || typeof saved.id !== 'string' || !saved.id || typeof saved.url !== 'string' || typeof saved.title !== 'string' || !saved.title || saved.title.length > 200 || (saved.titleSource !== 'automatic' && saved.titleSource !== 'custom') || !isStringArray(saved.tags) || typeof saved.notes !== 'string' || saved.notes.length > 4_000) {
        throw new StorageDataError('A stored URL record is invalid.', 'invalid')
      }
      let serialized: string
      try {
        const parsed = new URL(saved.url)
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) throw new Error()
        serialized = parsed.href
      } catch {
        throw new StorageDataError('A stored URL is invalid or unsupported.', 'invalid')
      }
      if (serialized !== saved.url) throw new StorageDataError('A stored URL is not browser-serialized.', 'invalid')
      if (savedIds.has(saved.id) || urls.has(saved.url)) throw new StorageDataError('Stored URL records are not unique.', 'invalid')
      savedIds.add(saved.id)
      urls.add(saved.url)
      if (saved.tags.length > 20) throw new StorageDataError('A stored URL has too many tags.', 'invalid')
      const normalizedTags = new Set<string>()
      for (const tag of saved.tags) {
        if (!tag || tag.trim() !== tag || tag.length > 32 || normalizedTags.has(tag.toLocaleLowerCase())) {
          throw new StorageDataError('A stored tag is invalid.', 'invalid')
        }
        normalizedTags.add(tag.toLocaleLowerCase())
      }
    }
  }
}

export function parsePersistedState(raw: unknown): PersistedState {
  if (!isRecord(raw)) throw new StorageDataError('Stored Protab data is not a valid object.', 'invalid')
  if (raw.schemaVersion === 2) {
    validateProjects(raw.projects)
    return structuredClone(raw) as unknown as PersistedState
  }
  if (raw.schemaVersion === 1) {
    validateProjects(raw.projects)
    return migrateV1ToV2(structuredClone(raw) as unknown as PersistedStateV1)
  }
  if (typeof raw.schemaVersion === 'number') {
    throw new StorageDataError(`Protab data uses unsupported schema version ${raw.schemaVersion}.`, 'unsupported-version')
  }
  throw new StorageDataError('Stored Protab data has no valid schema version.', 'invalid')
}
