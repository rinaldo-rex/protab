import { describe, expect, it } from 'vitest'
import { migrateV1ToV2, migrateV1ToV3, migrateV2ToV3 } from './migration'
import type { PersistedStateV1, PersistedStateV2 } from './types'

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

describe('V2 to V3 migration', () => {
  it('migrates empty state', () => {
    const v2: PersistedStateV2 = { schemaVersion: 2, projects: [] }
    expect(migrateV2ToV3(v2)).toEqual({ schemaVersion: 3, projects: [] })
  })

  it('makes every project a root (parentId: null)', () => {
    const v2: PersistedStateV2 = {
      schemaVersion: 2,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [], archivedAt: null },
        { id: 'p2', name: 'Two', savedUrls: [], archivedAt: Date.now() },
      ],
    }
    const v3 = migrateV2ToV3(v2)
    expect(v3.schemaVersion).toBe(3)
    expect(v3.projects.map((p) => p.parentId)).toEqual([null, null])
    expect(v3.projects[0].archivedAt).toBeNull()
    expect(v3.projects[1].archivedAt).toBeTypeOf('number')
  })

  it('preserves URLs, names, ids, and ordering', () => {
    const v2: PersistedStateV2 = {
      schemaVersion: 2,
      projects: [
        {
          id: 'p1',
          name: 'Research',
          savedUrls: [{ id: 'u1', url: 'https://one.test/', title: 'One', titleSource: 'automatic', tags: ['a'], notes: 'note', archivedAt: null }],
          archivedAt: null,
        },
      ],
    }
    const v3 = migrateV2ToV3(v2)
    expect(v3.projects[0]).toMatchObject({ id: 'p1', name: 'Research' })
    expect(v3.projects[0].savedUrls[0]).toMatchObject({ id: 'u1', url: 'https://one.test/', tags: ['a'] })
    const chain = migrateV1ToV3({ schemaVersion: 1, projects: [{ id: 'p1', name: 'Old', savedUrls: [{ id: 'u1', url: 'https://one.test/', title: 'One', titleSource: 'automatic', tags: [], notes: '' }] }] })
    expect(chain.schemaVersion).toBe(3)
    expect(chain.projects[0].parentId).toBeNull()
    expect(chain.projects[0].savedUrls[0].archivedAt).toBeNull()
  })
})
