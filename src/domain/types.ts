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

export type PersistedState = PersistedStateV2
export type Project = ProjectV2
export type SavedUrl = SavedUrlV2

export const emptyState = (): PersistedState => ({
  schemaVersion: 2,
  projects: [],
})
