import type { PersistedStateV1 } from './types'
import type { LiveTabGroup, LiveTabView, OwnershipCandidate } from './liveTabs'

export interface OwnershipEntry {
  tabId: number
  windowId: number
  projectId: string
  savedUrlId: string
  establishedUrl: string
}

export interface ReconciliationResult {
  tabs: LiveTabView[]
  ownership: OwnershipEntry[]
  matched: number
  ambiguous: number
}

function recordFor(state: PersistedStateV1, entry: OwnershipEntry) {
  const project = state.projects.find((candidate) => candidate.id === entry.projectId)
  const record = project?.savedUrls.find((candidate) => candidate.id === entry.savedUrlId)
  return project && record ? { project, record } : undefined
}

export function candidatesForUrl(state: PersistedStateV1, url: string | undefined): OwnershipCandidate[] {
  if (!url) return []
  return state.projects.flatMap((project) => project.savedUrls
    .filter((record) => record.url === url)
    .map((record) => ({ projectId: project.id, savedUrlId: record.id })))
}

export function reconcileOwnership(state: PersistedStateV1, tabs: LiveTabView[], entries: OwnershipEntry[]): ReconciliationResult {
  const byTabId = new Map(entries.map((entry) => [entry.tabId, entry]))
  const ownership: OwnershipEntry[] = []
  let matched = 0
  let ambiguous = 0
  const reconciled = tabs.map((tab) => {
    const explicit = byTabId.get(tab.tabId)
    const reference = explicit && recordFor(state, explicit)
    if (explicit && reference && reference.record.url === explicit.establishedUrl) {
      const retained = explicit.windowId === tab.windowId ? explicit : { ...explicit, windowId: tab.windowId }
      ownership.push(retained)
      return { ...tab, candidates: [], ownership: { projectId: retained.projectId, savedUrlId: retained.savedUrlId, establishedUrl: retained.establishedUrl, drifted: !tab.supported || tab.url !== retained.establishedUrl } }
    }
    const candidates = tab.supported ? candidatesForUrl(state, tab.url) : []
    if (candidates.length === 1 && tab.url) {
      const candidate = candidates[0]
      const entry = { tabId: tab.tabId, windowId: tab.windowId, projectId: candidate.projectId, savedUrlId: candidate.savedUrlId, establishedUrl: tab.url }
      ownership.push(entry)
      matched += 1
      return { ...tab, candidates: [], ownership: { ...candidate, establishedUrl: tab.url, drifted: false } }
    }
    if (candidates.length > 1) ambiguous += 1
    return { ...tab, candidates }
  })
  return { tabs: reconciled, ownership, matched, ambiguous }
}

export function groupLiveTabs(state: PersistedStateV1, tabs: LiveTabView[]): LiveTabGroup[] {
  const groups: LiveTabGroup[] = state.projects.flatMap((project) => {
    const owned = tabs.filter((tab) => tab.ownership?.projectId === project.id && !tab.ownership.drifted).sort((a, b) => a.index - b.index)
    return owned.length ? [{ id: `project:${project.id}`, projectId: project.id, label: project.name, tabs: owned }] : []
  })
  const unowned = tabs.filter((tab) => !tab.ownership || tab.ownership.drifted)
  const unassigned = unowned.filter((tab) => tab.supported).sort((a, b) => a.index - b.index)
  const unsupported = unowned.filter((tab) => !tab.supported).sort((a, b) => a.index - b.index)
  if (unassigned.length) groups.push({ id: 'unassigned', label: 'Unassigned', tabs: unassigned })
  if (unsupported.length) groups.push({ id: 'unsupported', label: 'Unsupported', tabs: unsupported, preCollapsed: true })
  return groups
}

export function instanceCounts(tabs: LiveTabView[]): Record<string, number> {
  const counts: Record<string, number> = {}
  tabs.forEach((tab) => {
    if (!tab.ownership) return
    const key = `${tab.ownership.projectId}:${tab.ownership.savedUrlId}`
    counts[key] = (counts[key] ?? 0) + 1
  })
  return counts
}
