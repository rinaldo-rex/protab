import type { PersistedStateV1, PersistedStateV2, PersistedStateV3 } from './types'

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

export function migrateV2ToV3(state: PersistedStateV2): PersistedStateV3 {
  return {
    schemaVersion: 3,
    projects: state.projects.map((project) => ({
      ...project,
      parentId: null,
      archivedAt: project.archivedAt ?? null,
    })),
  }
}

export function migrateV1ToV3(state: PersistedStateV1): PersistedStateV3 {
  return migrateV2ToV3(migrateV1ToV2(state))
}
