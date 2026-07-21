import { describe, expect, it } from 'vitest'
import { migrateV1ToV2 } from './migration'
import type { PersistedStateV1 } from './types'

describe('V1 to V2 migration', () => {
  it('migrates empty state', () => {
    const v1: PersistedStateV1 = { schemaVersion: 1, projects: [] }
    const v2 = migrateV1ToV2(v1)
    expect(v2).toEqual({ schemaVersion: 2, projects: [] })
  })

  it('adds archivedAt: null to all existing URLs', () => {
    const v1: PersistedStateV1 = {
      schemaVersion: 1,
      projects: [
        {
          id: 'p1',
          name: 'Research',
          savedUrls: [
            { id: 'u1', url: 'https://one.test/', title: 'One', titleSource: 'automatic', tags: [], notes: '' },
            { id: 'u2', url: 'https://two.test/', title: 'Two', titleSource: 'custom', tags: ['a', 'b'], notes: 'Some notes' },
          ],
        },
        {
          id: 'p2',
          name: 'Personal',
          savedUrls: [
            { id: 'u3', url: 'https://three.test/', title: 'Three', titleSource: 'automatic', tags: [], notes: '' },
          ],
        },
      ],
    }
    const v2 = migrateV1ToV2(v1)
    expect(v2.schemaVersion).toBe(2)
    expect(v2.projects).toHaveLength(2)
    expect(v2.projects[0].savedUrls[0]).toMatchObject({ id: 'u1', archivedAt: null })
    expect(v2.projects[0].savedUrls[1]).toMatchObject({ id: 'u2', archivedAt: null })
    expect(v2.projects[1].savedUrls[0]).toMatchObject({ id: 'u3', archivedAt: null })
  })

  it('preserves all other URL metadata', () => {
    const v1: PersistedStateV1 = {
      schemaVersion: 1,
      projects: [{
        id: 'p1',
        name: 'Test',
        savedUrls: [{
          id: 'u1',
          url: 'https://example.com/path',
          title: 'Custom Title',
          titleSource: 'custom',
          tags: ['research', 'important'],
          notes: 'These are notes',
        }],
      }],
    }
    const v2 = migrateV1ToV2(v1)
    expect(v2.projects[0].savedUrls[0]).toEqual({
      id: 'u1',
      url: 'https://example.com/path',
      title: 'Custom Title',
      titleSource: 'custom',
      tags: ['research', 'important'],
      notes: 'These are notes',
      archivedAt: null,
    })
  })

  it('preserves project names and IDs', () => {
    const v1: PersistedStateV1 = {
      schemaVersion: 1,
      projects: [
        { id: 'proj-1', name: 'My Project', savedUrls: [] },
        { id: 'proj-2', name: 'Another', savedUrls: [] },
      ],
    }
    const v2 = migrateV1ToV2(v1)
    expect(v2.projects[0]).toMatchObject({ id: 'proj-1', name: 'My Project' })
    expect(v2.projects[1]).toMatchObject({ id: 'proj-2', name: 'Another' })
  })
})
