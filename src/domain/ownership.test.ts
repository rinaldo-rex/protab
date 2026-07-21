import { describe, expect, it } from 'vitest'
import type { PersistedStateV1 } from './types'
import type { LiveTabView } from './liveTabs'
import { groupLiveTabs, instanceCounts, reconcileOwnership } from './ownership'

const state: PersistedStateV1 = { schemaVersion: 1, projects: [
  { id: 'p1', name: 'First', savedUrls: [{ id: 'u1', url: 'https://same.test/', title: 'Same', titleSource: 'automatic', tags: [], notes: '' }] },
  { id: 'p2', name: 'Second', savedUrls: [{ id: 'u2', url: 'https://same.test/', title: 'Same copy', titleSource: 'automatic', tags: [], notes: '' }] },
] }
const tab = (tabId: number, index: number, url = 'https://same.test/'): LiveTabView => ({ tabId, windowId: 1, index, active: false, title: `Tab ${tabId}`, url, urlSummary: 'same.test', hostname: 'same.test', supported: true, candidates: [] })

describe('runtime ownership', () => {
  it('retains explicit identity through navigation and updates its window', () => {
    const result = reconcileOwnership(state, [{ ...tab(1, 0, 'https://elsewhere.test/'), windowId: 2 }], [{ tabId: 1, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://same.test/' }])
    expect(result.tabs[0].ownership).toMatchObject({ projectId: 'p1', savedUrlId: 'u1', drifted: true })
    expect(result.ownership[0].windowId).toBe(2)
  })

  it('discards dangling and retargeted ownership without changing durable state', () => {
    const before = structuredClone(state)
    const result = reconcileOwnership(state, [tab(1, 0), tab(2, 1)], [
      { tabId: 1, windowId: 1, projectId: 'missing', savedUrlId: 'u1', establishedUrl: 'https://same.test/' },
      { tabId: 2, windowId: 1, projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://old.test/' },
    ])
    expect(result.ownership).toEqual([])
    expect(result.tabs.every((item) => !item.ownership && item.candidates.length === 2)).toBe(true)
    expect(state).toEqual(before)
  })

  it('reconciles unique matches but leaves ambiguous matches unassigned', () => {
    const uniqueState: PersistedStateV1 = { schemaVersion: 1, projects: [{ id: 'p1', name: 'First', savedUrls: [{ id: 'u1', url: 'https://unique.test/', title: 'Unique', titleSource: 'automatic', tags: [], notes: '' }] }] }
    const unique = reconcileOwnership(uniqueState, [tab(5, 0, 'https://unique.test/')], [])
    expect(unique.tabs[0].ownership).toMatchObject({ projectId: 'p1', savedUrlId: 'u1' })
    expect(unique).toMatchObject({ matched: 1, ambiguous: 0 })

    const ambiguous = reconcileOwnership(state, [tab(6, 0)], [])
    expect(ambiguous.tabs[0].ownership).toBeUndefined()
    expect(ambiguous.tabs[0].candidates).toHaveLength(2)
    expect(ambiguous).toMatchObject({ matched: 0, ambiguous: 1 })
  })

  it('places drifted owned tabs under Unassigned while retaining drift context', () => {
    const drifted = { ...tab(8, 0, 'https://elsewhere.test/'), ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://same.test/', drifted: true } }
    const groups = groupLiveTabs(state, [drifted])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'unassigned', label: 'Unassigned' })
    expect(groups[0].tabs[0].ownership).toMatchObject({ projectId: 'p1', savedUrlId: 'u1', drifted: true })
    expect(instanceCounts([drifted])).toEqual({ 'p1:u1': 1 })
  })

  it('groups with Unassigned first then project order and tabs in strip order', () => {
    const tabs = [
      { ...tab(1, 4), ownership: { projectId: 'p2', savedUrlId: 'u2', establishedUrl: 'https://same.test/', drifted: false } },
      { ...tab(2, 3), ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://same.test/', drifted: false } },
      { ...tab(3, 1), ownership: { projectId: 'p1', savedUrlId: 'u1', establishedUrl: 'https://same.test/', drifted: false } },
      tab(4, 0),
    ]
    const groups = groupLiveTabs(state, tabs)
    expect(groups.map((group) => group.label)).toEqual(['Unassigned', 'First', 'Second'])
    expect(groups[1].tabs.map((item) => item.tabId)).toEqual([3, 2])
    expect(instanceCounts(tabs)).toEqual({ 'p1:u1': 2, 'p2:u2': 1 })
  })
})
