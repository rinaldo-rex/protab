import type { PersistedStateV1, PersistedStateV2 } from './types'

export function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2 {
  return {
    schemaVersion: 2,
    projects: state.projects.map((project) => ({
      ...project,
      savedUrls: project.savedUrls.map((url) => ({
        ...url,
        archivedAt: null,
      })),
    })),
  }
}
