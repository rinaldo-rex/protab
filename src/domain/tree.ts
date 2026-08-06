import type { PersistedState, Project, SavedUrl } from './types'
import { DomainError, findProject } from './validation'

/** Projects directly contained by `projectId` (order = storage order); `projectId` null returns roots. */
export function childrenOf(state: PersistedState, projectId: string | null): Project[] {
  return state.projects.filter((project) => project.parentId === projectId)
}

/** Root projects (`parentId` is null), in storage order. */
export function rootProjects(state: PersistedState): Project[] {
  return childrenOf(state, null)
}

/** Projects sharing the same parent as `projectId` (including itself). */
export function siblingsOf(state: PersistedState, projectId: string): Project[] {
  const project = findProject(state, projectId)
  return state.projects.filter((candidate) => candidate.parentId === project.parentId)
}

/** Strict ancestor test: is `projectId` inside the subtree of `ancestorId`? */
export function isDescendant(state: PersistedState, projectId: string, ancestorId: string): boolean {
  let current = findProject(state, projectId)
  while (current.parentId) {
    if (current.parentId === ancestorId) return true
    current = findProject(state, current.parentId)
  }
  return false
}

/** Ids of `projectId` and every descendant, in storage order. */
export function subtreeIds(state: PersistedState, projectId: string): string[] {
  const result: string[] = []
  const stack = [...childrenOf(state, projectId).map((child) => child.id)]
  while (stack.length > 0) {
    const id = stack.pop()!
    result.push(id)
    for (const child of childrenOf(state, id)) stack.push(child.id)
  }
  return [projectId, ...result]
}

/** Projects making up `projectId`'s subtree (including itself). */
export function subtreeProjects(state: PersistedState, projectId: string): Project[] {
  const ids = new Set(subtreeIds(state, projectId))
  return state.projects.filter((project) => ids.has(project.id))
}

/** Every saved URL in the subtree (all leaves' URLs). */
export function subtreeSavedUrls(state: PersistedState, projectId: string): SavedUrl[] {
  return subtreeProjects(state, projectId).flatMap((project) => project.savedUrls)
}

/** Canonical address: colon-joined sibling names from the root, e.g. 'Client work:API docs'. */
export function pathOf(state: PersistedState, projectId: string, separator = ':'): string {
  const parts: string[] = []
  let current = findProject(state, projectId)
  for (;;) {
    parts.unshift(current.name)
    if (!current.parentId) break
    current = findProject(state, current.parentId)
  }
  return parts.join(separator)
}

/** Resolve a canonical path to a project, or undefined. Case-insensitive per segment. */
export function resolvePath(state: PersistedState, path: string, separator = ':'): Project | undefined {
  const segments = path.split(separator).map((segment) => segment.trim())
  let parentId: string | null = null
  let found: Project | undefined
  for (const segment of segments) {
    if (!segment) return undefined
    found = state.projects.find(
      (project) => project.parentId === parentId && project.name.toLocaleLowerCase() === segment.toLocaleLowerCase(),
    )
    if (!found) return undefined
    parentId = found.id
  }
  return found
}

/** Whether `name` is free among the children of `parentId` (ignoring `excludingId`). */
export function siblingNameAvailable(
  state: PersistedState,
  parentId: string | null,
  name: string,
  excludingId?: string,
): boolean {
  const key = name.trim().toLocaleLowerCase()
  return !state.projects.some(
    (project) => project.parentId === parentId && project.id !== excludingId && project.name.toLocaleLowerCase() === key,
  )
}

export const MISC_LEAF_NAME = 'Misc'

/** The folder's own URL bucket: a Misc child leaf, created on demand (documented rule). */
export function ensureMiscLeaf(state: PersistedState, parentId: string, createId: () => string): Project {
  const existing = childrenOf(state, parentId).find((child) => child.name.toLocaleLowerCase() === MISC_LEAF_NAME.toLocaleLowerCase())
  if (existing) {
    if (childrenOf(state, existing.id).length > 0) {
      throw new DomainError(
        `Cannot store URLs in "${existing.name}": it is a folder, not a leaf. Rename or restructure it first.`,
        'MISC_IS_FOLDER',
      )
    }
    return existing
  }
  const id = createId()
  const leaf: Project = { id, name: MISC_LEAF_NAME, parentId, savedUrls: [], archivedAt: null }
  state.projects.push(leaf)
  return leaf
}

/**
 * Documented Rule A (auto-wrap): move a node's saved URLs into a Misc child leaf
 * so the node becomes a folder. Reuses an existing Misc leaf; merges by URL to
 * avoid duplicates. Mutates `state`.
 */
export function wrapUrlsIntoMisc(state: PersistedState, projectId: string, createId: () => string): void {
  const project = findProject(state, projectId)
  if (project.savedUrls.length === 0) return
  const misc = ensureMiscLeaf(state, projectId, createId)
  const existingUrls = new Set(misc.savedUrls.map((url) => url.url))
  for (const url of project.savedUrls) {
    if (!existingUrls.has(url.url)) {
      misc.savedUrls.push(url)
      existingUrls.add(url.url)
    }
  }
  project.savedUrls = []
}

/**
 * Documented Rule B: the project a save lands in. A leaf returns itself; a
 * folder returns its Misc leaf (created on demand) so a folder never holds
 * direct URLs. Mutates `state` only to create a missing Misc leaf.
 */
export function resolveSaveTarget(state: PersistedState, projectId: string, createId: () => string): Project {
  const project = findProject(state, projectId)
  if (childrenOf(state, projectId).length === 0) return project
  return ensureMiscLeaf(state, projectId, createId)
}

/**
 * Read-only variant of Rule B: the id of the project a save would land in,
 * without creating a Misc leaf. A leaf returns itself; a folder returns its
 * existing Misc leaf, or (when no Misc exists yet) the folder itself — the
 * write will create the Misc leaf at that point.
 */
export function targetLeafId(state: PersistedState, projectId: string): string {
  const project = findProject(state, projectId)
  if (childrenOf(state, projectId).length === 0) return project.id
  const misc = childrenOf(state, projectId).find(
    (child) => child.name.toLocaleLowerCase() === MISC_LEAF_NAME.toLocaleLowerCase(),
  )
  return misc?.id ?? project.id
}

/** The leaf project that owns a saved URL, or undefined. */
export function ownerProjectId(state: PersistedState, savedUrlId: string): string | undefined {
  const project = state.projects.find((p) => p.savedUrls.some((record) => record.id === savedUrlId))
  return project?.id
}
