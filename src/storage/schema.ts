import type { PersistedStateV1, PersistedStateV2, PersistedState, ParsePersistedStateResult } from '../domain/types'
import { migrateV1ToV3, migrateV2ToV3 } from '../domain/migration'

const CURRENT_SCHEMA_VERSION = 3

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
  return parsePersistedStateWithMetadata(raw).state
}

/**
 * Structural tree validation. Only structural invariants live here (ids
 * unique, parent refs resolve, no cycles, no self-parent). Sibling-name
 * uniqueness and the reserved ':' policy are write-time rules enforced by
 * applyCommand/validation so that legacy flat data (which may contain
 * duplicate root names) always loads and migrates safely.
 */
function validateTree(state: PersistedState): void {
  const byId = new Map(state.projects.map((project) => [project.id, project]))
  for (const project of state.projects) {
    if (project.parentId !== null && !byId.has(project.parentId)) {
      throw new StorageDataError('A stored project references a missing parent.', 'invalid')
    }
  }
  for (const project of state.projects) {
    const seen = new Set<string>()
    let current: PersistedState['projects'][number] | undefined = project
    while (current?.parentId) {
      if (seen.has(current.id)) throw new StorageDataError('Stored project nesting contains a cycle.', 'invalid')
      if (current.parentId === current.id) throw new StorageDataError('A stored project is its own parent.', 'invalid')
      seen.add(current.id)
      current = byId.get(current.parentId)
      if (!current) throw new StorageDataError('A stored project references a missing parent.', 'invalid')
    }
  }
}

export function parsePersistedStateWithMetadata(raw: unknown): ParsePersistedStateResult {
  if (!isRecord(raw)) throw new StorageDataError('Stored Protab data is not a valid object.', 'invalid')
  const version = raw.schemaVersion
  if (version === CURRENT_SCHEMA_VERSION) {
    validateProjects(raw.projects)
    const state = structuredClone(raw) as unknown as PersistedState
    validateTree(state)
    return {
      state,
      migrated: false,
      originalSchemaVersion: CURRENT_SCHEMA_VERSION,
      currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    }
  }
  if (version === 1 || version === 2) {
    validateProjects(raw.projects)
    const migratedState = migrateToCurrent(structuredClone(raw) as unknown as PersistedStateV1 | PersistedStateV2)
    validateTree(migratedState)
    return {
      state: migratedState,
      migrated: true,
      originalSchemaVersion: version as 1 | 2,
      currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    }
  }
  if (typeof version === 'number') {
    throw new StorageDataError(`Protab data uses unsupported schema version ${version}.`, 'unsupported-version')
  }
  throw new StorageDataError('Stored Protab data has no valid schema version.', 'invalid')
}

function migrateToCurrent(raw: PersistedStateV1 | PersistedStateV2): PersistedState {
  if (raw.schemaVersion === 1) return migrateV1ToV3(raw as PersistedStateV1)
  return migrateV2ToV3(raw as PersistedStateV2)
}
