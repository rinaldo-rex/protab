export interface PersistedStateV1 {
  schemaVersion: 1
  projects: Project[]
}

export interface Project {
  id: string
  name: string
  savedUrls: SavedUrl[]
}

export interface SavedUrl {
  id: string
  url: string
  title: string
  titleSource: 'automatic' | 'custom'
  tags: string[]
  notes: string
}

export const emptyState = (): PersistedStateV1 => ({
  schemaVersion: 1,
  projects: [],
})
