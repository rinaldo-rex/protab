export interface PersistedStateV1 {
  schemaVersion: 1
  projects: ProjectV1[]
}

export interface ProjectV1 {
  id: string
  name: string
  savedUrls: SavedUrlV1[]
}

export interface SavedUrlV1 {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
}

export interface PersistedStateV2 {
  schemaVersion: 2
  projects: ProjectV2[]
}

export interface ProjectV2 {
  id: string
  name: string
  savedUrls: SavedUrlV2[]
  archivedAt?: number | null
}

export interface SavedUrlV2 {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
  archivedAt: number | null
}

export interface PersistedStateV3 {
  schemaVersion: 3
  projects: ProjectV3[]
}

/**
 * A project node in the nested tree. `parentId` is null for root projects and
 * otherwise references an existing project id. A node is either a leaf (holds
 * saved URLs) or a folder (holds children); see design_decisions.md for the
 * documented Misc-leaf rules that keep folders free of direct URLs.
 */
export interface ProjectV3 {
  id: string
  name: string
  parentId: string | null
  savedUrls: SavedUrlV3[]
  archivedAt: number | null
}

export interface SavedUrlV3 {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
  archivedAt: number | null
}

export type PersistedState = PersistedStateV3
export type Project = ProjectV3
export type SavedUrl = SavedUrlV3

export const emptyState = (): PersistedState => ({
  schemaVersion: 3,
  projects: [],
})

export interface MigrationBackup {
  schemaVersion: 1
  createdAt: number
  fromSchemaVersion: number
  toSchemaVersion: number
  rawState: unknown
}

export interface ParsePersistedStateResult {
  state: PersistedState
  migrated: boolean
  originalSchemaVersion: number
  currentSchemaVersion: number
}
