import { describe, expect, it } from 'vitest'
import { emptyState, type PersistedState } from './types'
import { applyCommand } from './applyCommand'
import {
  childrenOf,
  ensureMiscLeaf,
  isDescendant,
  pathOf,
  resolvePath,
  resolveSaveTarget,
  siblingNameAvailable,
  siblingsOf,
  subtreeIds,
  subtreeProjects,
  subtreeSavedUrls,
  wrapUrlsIntoMisc,
} from './tree'
import { DomainError } from './validation'

function ids(...values: string[]) {
  let index = 0
  return () => values[index++]
}

/** Builds a tree from a compact spec: { id, name, parent? } plus optional savedUrls. */
function tree(projects: Array<{ id: string; name: string; parent?: string | null; urls?: Array<{ id: string; url: string }> }>): PersistedState {
  return emptyState().schemaVersion === 3
    ? {
        schemaVersion: 3,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          parentId: p.parent ?? null,
          savedUrls: (p.urls ?? []).map((u) => ({
            id: u.id,
            url: u.url,
            title: u.url,
            titleSource: 'automatic' as const,
            tags: [],
            notes: '',
            archivedAt: null,
          })),
          archivedAt: null,
        })),
      }
    : emptyState()
}

const sample = () => tree([
  { id: 'root1', name: 'Client work' },
  { id: 'root2', name: 'Personal' },
  { id: 'sub1', name: 'Reporting', parent: 'root1' },
  { id: 'sub2', name: 'API docs', parent: 'sub1' },
  { id: 'sub3', name: 'Design', parent: 'root1' },
])

describe('tree traversal helpers', () => {
  it('lists children and siblings in storage order', () => {
    const state = sample()
    expect(childrenOf(state, 'root1').map((p) => p.id)).toEqual(['sub1', 'sub3'])
    expect(siblingsOf(state, 'sub1').map((p) => p.id)).toEqual(['sub1', 'sub3'])
    expect(siblingsOf(state, 'root2').map((p) => p.id)).toEqual(['root1', 'root2'])
  })

  it('computes strict descendants', () => {
    const state = sample()
    expect(isDescendant(state, 'sub2', 'root1')).toBe(true)
    expect(isDescendant(state, 'sub1', 'root1')).toBe(true)
    expect(isDescendant(state, 'root1', 'root1')).toBe(false)
    expect(isDescendant(state, 'root2', 'root1')).toBe(false)
  })

  it('builds subtree id/project/url sets including the node and all leaves', () => {
    const state = tree([
      { id: 'root', name: 'Root' },
      { id: 'a', name: 'A', parent: 'root', urls: [{ id: 'ua', url: 'https://a.test/' }] },
      { id: 'b', name: 'B', parent: 'a', urls: [{ id: 'ub', url: 'https://b.test/' }] },
    ])
    expect(subtreeIds(state, 'root')).toEqual(['root', 'a', 'b'])
    expect(subtreeProjects(state, 'root').map((p) => p.id)).toEqual(['root', 'a', 'b'])
    expect(subtreeSavedUrls(state, 'root').map((u) => u.id)).toEqual(['ua', 'ub'])
    expect(subtreeSavedUrls(state, 'a').map((u) => u.id)).toEqual(['ua', 'ub'])
    expect(subtreeIds(state, 'b')).toEqual(['b'])
  })

  it('round-trips canonical paths', () => {
    const state = sample()
    expect(pathOf(state, 'root1')).toBe('Client work')
    expect(pathOf(state, 'sub1')).toBe('Client work:Reporting')
    expect(pathOf(state, 'sub2')).toBe('Client work:Reporting:API docs')
    expect(resolvePath(state, 'Client work:Reporting:API docs')?.id).toBe('sub2')
    expect(resolvePath(state, 'client work:reporting')?.id).toBe('sub1')
    expect(resolvePath(state, 'Client work:Missing')).toBeUndefined()
    expect(resolvePath(state, '')).toBeUndefined()
  })

  it('allows reused names in different branches', () => {
    const state = tree([
      { id: 'r1', name: 'Work' },
      { id: 'r2', name: 'Home' },
      { id: 'c1', name: 'Foo', parent: 'r1' },
      { id: 'c2', name: 'Foo', parent: 'r2' },
    ])
    expect(siblingNameAvailable(state, 'r1', 'Foo')).toBe(false)
    expect(siblingNameAvailable(state, 'r2', 'Foo', 'c2')).toBe(true)
    expect(resolvePath(state, 'Work:Foo')?.id).toBe('c1')
    expect(resolvePath(state, 'Home:Foo')?.id).toBe('c2')
  })
})

describe('Misc leaf rules', () => {
  it('wraps a node with URLs into a Misc leaf when a child is added', () => {
    let state = tree([{ id: 'root', name: 'Root', urls: [{ id: 'u1', url: 'https://a.test/' }, { id: 'u2', url: 'https://b.test/' }] }])
    state = applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'root', name: 'Child' }, ids('misc1', 'child1')).state
    const root = state.projects.find((p) => p.id === 'root')!
    expect(root.savedUrls).toEqual([])
    const misc = state.projects.find((p) => p.id === 'misc1')!
    expect(misc).toMatchObject({ name: 'Misc', parentId: 'root' })
    expect(misc.savedUrls.map((u) => u.id)).toEqual(['u1', 'u2'])
    expect(state.projects.find((p) => p.id === 'child1')!.parentId).toBe('root')
  })

  it('reuses an existing Misc leaf instead of duplicating', () => {
    let state = tree([{ id: 'root', name: 'Root', urls: [{ id: 'u1', url: 'https://a.test/' }] }])
    state = applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'root', name: 'First' }, ids('misc1', 'c1')).state
    state = applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'root', name: 'Second' }, ids('c2')).state
    const miscs = state.projects.filter((p) => p.name === 'Misc')
    expect(miscs).toHaveLength(1)
    expect(state.projects.filter((p) => p.parentId === 'root').map((p) => p.name).sort()).toEqual(['First', 'Misc', 'Second'])
  })

  it('routes folder-targeted saves into the Misc leaf (created on demand)', () => {
    let state = tree([{ id: 'root', name: 'Root' }, { id: 'child', name: 'Child', parent: 'root' }])
    state = applyCommand(state, { type: 'CREATE_SAVED_URL', projectId: 'root', url: 'https://new.test/' }, ids('u1')).state
    const misc = state.projects.find((p) => p.name === 'Misc' && p.parentId === 'root')!
    expect(misc.savedUrls.map((u) => u.url)).toEqual(['https://new.test/'])
    expect(state.projects.find((p) => p.id === 'root')!.savedUrls).toEqual([])
  })

  it('leaves leaf-targeted saves untouched', () => {
    const state = tree([{ id: 'leaf', name: 'Leaf' }])
    const result = applyCommand(state, { type: 'CREATE_SAVED_URL', projectId: 'leaf', url: 'https://new.test/' }, ids('u1'))
    expect(result.state.projects.find((p) => p.id === 'leaf')!.savedUrls[0].url).toBe('https://new.test/')
    expect(result.state.projects).toHaveLength(1)
  })

  it('ensureMiscLeaf and resolveSaveTarget behave correctly', () => {
    const state = sample()
    expect(resolveSaveTarget(state, 'root2', ids('x')).id).toBe('root2')
    const saved = tree([{ id: 'root', name: 'Root' }, { id: 'c', name: 'C', parent: 'root' }])
    expect(resolveSaveTarget(saved, 'root', ids('m1')).id).toBe('m1')
    const wrapped = tree([{ id: 'root', name: 'Root', urls: [{ id: 'u1', url: 'https://a.test/' }] }])
    wrapUrlsIntoMisc(wrapped, 'root', ids('m1'))
    expect(wrapped.projects.find((p) => p.id === 'root')!.savedUrls).toEqual([])
    expect(ensureMiscLeaf(wrapped, 'root', ids('x2')).id).toBe('m1')
  })

  it('rejects wrapping into a Misc that is itself a folder', () => {
    const state = tree([
      { id: 'root', name: 'Root' },
      { id: 'misc', name: 'Misc', parent: 'root' },
      { id: 'misc-child', name: 'Deep', parent: 'misc' },
    ])
    expect(() => ensureMiscLeaf(state, 'root', ids('x'))).toThrowError(DomainError)
  })
})

describe('nested project commands', () => {
  it('creates a subproject with no URLs in the parent', () => {
    let state = tree([{ id: 'root', name: 'Root' }])
    const created = applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'root', name: 'Child' }, ids('c1'))
    expect(created.meta).toMatchObject({ didWrite: true, affectedProjectId: 'c1' })
    expect(created.state.projects.find((p) => p.id === 'c1')).toMatchObject({ name: 'Child', parentId: 'root', savedUrls: [] })
    state = created.state
    expect(() => applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'root', name: 'child' })).toThrowError(DomainError)
    expect(() => applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'missing', name: 'X' })).toThrowError(DomainError)
    expect(() => applyCommand(state, { type: 'CREATE_PROJECT', name: 'Root:Bad' })).toThrowError(DomainError)
  })

  it('reparents a subtree, applying Rule A when the target holds URLs', () => {
    let state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'a-child', name: 'Sub', parent: 'a', urls: [{ id: 'u1', url: 'https://a.test/' }] },
    ])
    // Move a-child under B (B has no URLs yet)
    let result = applyCommand(state, { type: 'REPARENT_PROJECT', projectId: 'a-child', newParentId: 'b' }, ids('x'))
    expect(result.state.projects.find((p) => p.id === 'a-child')!.parentId).toBe('b')
    state = result.state
    // Now B holds URLs and we reparent another child into it → URLs wrap to Misc
    state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', urls: [{ id: 'u1', url: 'https://b.test/' }] },
      { id: 'c', name: 'C' },
    ])
    result = applyCommand(state, { type: 'REPARENT_PROJECT', projectId: 'c', newParentId: 'b' }, ids('m1', 'x'))
    const bb = result.state.projects.find((p) => p.id === 'b')!
    expect(bb.savedUrls).toEqual([])
    expect(result.state.projects.find((p) => p.name === 'Misc' && p.parentId === 'b')!.savedUrls.map((u) => u.url)).toEqual(['https://b.test/'])
    expect(result.state.projects.find((p) => p.id === 'c')!.parentId).toBe('b')
  })

  it('rejects cycric reparenting and sibling collisions', () => {
    const state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C', parent: 'b' },
    ])
    expect(() => applyCommand(state, { type: 'REPARENT_PROJECT', projectId: 'a', newParentId: 'c' })).toThrowError(DomainError)
    expect(() => applyCommand(state, { type: 'REPARENT_PROJECT', projectId: 'b', newParentId: 'b' })).toThrowError(DomainError)
    // Sibling collision: moving 'C' under a parent that already has a child named 'C'
    const crowded = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C', parent: 'b' },
      { id: 'd', name: 'C' },
    ])
    expect(() => applyCommand(crowded, { type: 'REPARENT_PROJECT', projectId: 'd', newParentId: 'b' })).toThrowError(DomainError)
    // Moving to root when a root with the same name exists
    const rooted = tree([{ id: 'a', name: 'A' }, { id: 'x', name: 'X' }, { id: 'y', name: 'A', parent: 'x' }])
    expect(() => applyCommand(rooted, { type: 'REPARENT_PROJECT', projectId: 'y', newParentId: null })).toThrowError(DomainError)
  })

  it('reorders within a sibling group, not just at root', () => {
    const state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C', parent: 'a' },
      { id: 'd', name: 'D' },
    ])
    const reordered = applyCommand(state, { type: 'REORDER_PROJECT', projectId: 'c', toIndex: 0 }).state
    const aa = reordered.projects.find((p) => p.id === 'a')!
    expect(childrenOf(reordered, aa.id).map((p) => p.id)).toEqual(['c', 'b'])
    // Root order unchanged
    expect(reordered.projects.filter((p) => p.parentId === null).map((p) => p.id)).toEqual(['a', 'd'])
  })

  it('deletes a whole subtree and reports every deleted id', () => {
    const state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C', parent: 'b' },
      { id: 'd', name: 'D' },
    ])
    const result = applyCommand(state, { type: 'DELETE_PROJECT', projectId: 'a' })
    expect(result.meta.deletedProjectIds).toEqual(['a', 'b', 'c'])
    expect(result.state.projects.map((p) => p.id)).toEqual(['d'])
    expect(() => applyCommand(state, { type: 'DELETE_PROJECT', projectId: 'missing' })).toThrowError(DomainError)
  })

  it('archives a whole subtree and reports affected ids', () => {
    const state = tree([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C' },
    ])
    const result = applyCommand(state, { type: 'ARCHIVE_PROJECT', projectId: 'a', archived: true })
    expect(result.meta.affectedProjectIds).toEqual(['a', 'b'])
    const unaged = applyCommand(result.state, { type: 'ARCHIVE_PROJECT', projectId: 'a', archived: false })
    expect(unaged.state.projects.map((p) => p.archivedAt)).toEqual([null, null, null])
  })

  it('does not mutate the input state (clone semantics)', () => {
    const state = tree([{ id: 'a', name: 'A', urls: [{ id: 'u1', url: 'https://a.test/' }] }])
    const before = JSON.stringify(state)
    applyCommand(state, { type: 'CREATE_SUBPROJECT', parentId: 'a', name: 'Child' }, ids('m1', 'c1'))
    expect(JSON.stringify(state)).toBe(before)
  })
})
