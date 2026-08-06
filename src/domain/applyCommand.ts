import type { Command, CommandResultMeta } from './commands'
import type { PersistedState, SavedUrl } from './types'
import { isDescendant, resolveSaveTarget, siblingNameAvailable, subtreeIds, wrapUrlsIntoMisc } from './tree'
import {
  assertUniqueUrl,
  automaticTitle,
  cloneState,
  DomainError,
  findProject,
  findSavedUrl,
  moveItem,
  normalizeTags,
  serializeHttpUrl,
  validateNotes,
  validateTitle,
} from './validation'

export interface ApplyResult {
  state: PersistedState
  meta: CommandResultMeta
}

/** Write-time name rules: trim/non-empty/≤80, no reserved path separator, no sibling collision. */
export function validateNestedProjectName(
  state: PersistedState,
  parentId: string | null,
  value: string,
  excludingId?: string,
): string {
  const name = validateProjectNameSafe(value)
  if (name.includes(':')) {
    throw new DomainError('Project names cannot contain ":" because it separates sub-project paths.', 'PROJECT_NAME_RESERVED_CHAR')
  }
  if (!siblingNameAvailable(state, parentId, name, excludingId)) {
    throw new DomainError(`A project named "${name}" already exists here.`, 'SIBLING_NAME_TAKEN')
  }
  return name
}

// Local alias to avoid importing a second name from validation.
function validateProjectNameSafe(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new DomainError('Enter a project name.', 'PROJECT_NAME_REQUIRED')
  if (trimmed.length > 80) throw new DomainError('Project names can be at most 80 characters.', 'PROJECT_NAME_TOO_LONG')
  return trimmed
}

export function applyCommand(
  current: PersistedState,
  command: Command,
  createId: () => string = () => crypto.randomUUID(),
): ApplyResult {
  const state = cloneState(current)

  switch (command.type) {
    case 'CREATE_PROJECT': {
      const projectId = createId()
      const name = validateNestedProjectName(state, null, command.name)
      state.projects.push({ id: projectId, name, parentId: null, savedUrls: [], archivedAt: null })
      return { state, meta: { didWrite: true, affectedProjectId: projectId } }
    }
    case 'CREATE_SUBPROJECT': {
      const parent = findProject(state, command.parentId)
      const name = validateNestedProjectName(state, parent.id, command.name)
      // Rule A: a node that holds URLs becomes a folder via a Misc leaf first.
      wrapUrlsIntoMisc(state, parent.id, createId)
      const projectId = createId()
      state.projects.push({ id: projectId, name, parentId: parent.id, savedUrls: [], archivedAt: null })
      return { state, meta: { didWrite: true, affectedProjectId: projectId } }
    }
    case 'RENAME_PROJECT': {
      const project = findProject(state, command.projectId)
      project.name = validateNestedProjectName(state, project.parentId, command.name, project.id)
      return { state, meta: { didWrite: true, affectedProjectId: project.id } }
    }
    case 'REORDER_PROJECT': {
      const project = findProject(state, command.projectId)
      const siblings = state.projects.filter((item) => item.parentId === project.parentId)
      const from = siblings.findIndex((item) => item.id === command.projectId)
      if (from < 0) throw new DomainError('That project no longer exists.', 'PROJECT_NOT_FOUND')
      const reordered = moveItem(siblings, from, command.toIndex)
      state.projects = rebaseSiblingGroup(state.projects, reordered)
      return { state, meta: { didWrite: from !== command.toIndex, affectedProjectId: command.projectId } }
    }
    case 'REPARENT_PROJECT': {
      const project = findProject(state, command.projectId)
      const newParentId = command.newParentId
      if (newParentId === project.id) {
        throw new DomainError('A project cannot be nested inside itself.', 'CIRCULAR_PARENT')
      }
      if (newParentId) {
        findProject(state, newParentId)
        if (isDescendant(state, newParentId, project.id)) {
          throw new DomainError('A project cannot be nested inside one of its own sub-projects.', 'CIRCULAR_PARENT')
        }
        wrapUrlsIntoMisc(state, newParentId, createId)
        project.name = validateNestedProjectName(state, newParentId, project.name, project.id)
        project.parentId = newParentId
      } else {
        project.name = validateNestedProjectName(state, null, project.name, project.id)
        project.parentId = null
      }
      // Re-insert into the flat array positioned relative to the destination's children.
      const [moved] = state.projects.splice(state.projects.indexOf(project), 1)
      const destSiblings = state.projects.filter((item) => item.parentId === (newParentId ?? null))
      const toIndex = command.toIndex ?? destSiblings.length
      let insertAt: number
      if (toIndex >= destSiblings.length) {
        const last = destSiblings[destSiblings.length - 1]
        insertAt = last ? state.projects.indexOf(last) + 1 : state.projects.length
      } else {
        insertAt = state.projects.indexOf(destSiblings[toIndex])
      }
      state.projects.splice(insertAt, 0, moved)
      return { state, meta: { didWrite: true, affectedProjectId: project.id } }
    }
    case 'DELETE_PROJECT': {
      if (!state.projects.some((item) => item.id === command.projectId)) {
        throw new DomainError('That project no longer exists.', 'PROJECT_NOT_FOUND')
      }
      const deletedProjectIds = subtreeIds(state, command.projectId)
      const removed = new Set(deletedProjectIds)
      state.projects = state.projects.filter((item) => !removed.has(item.id))
      return { state, meta: { didWrite: true, deletedProjectIds } }
    }
    case 'CREATE_SAVED_URL': {
      const target = resolveSaveTarget(state, command.projectId, createId)
      const url = serializeHttpUrl(command.url)
      assertUniqueUrl(target, url)
      const suppliedTitle = command.title?.trim()
      const savedUrlId = createId()
      const record: SavedUrl = {
        id: savedUrlId,
        url,
        title: suppliedTitle ? validateTitle(command.title ?? '') : automaticTitle(url),
        titleSource: suppliedTitle ? 'custom' : 'automatic',
        tags: normalizeTags(command.tags ?? []),
        notes: validateNotes(command.notes ?? ''),
        archivedAt: null,
      }
      target.savedUrls.push(record)
      return { state, meta: { didWrite: true, affectedProjectId: target.id, affectedSavedUrlId: savedUrlId } }
    }
    case 'UPDATE_SAVED_URL': {
      const project = findProject(state, command.projectId)
      const record = findSavedUrl(project, command.savedUrlId)
      const changes = command.changes
      if (changes.url !== undefined) {
        const url = serializeHttpUrl(changes.url)
        assertUniqueUrl(project, url, record.id)
        record.url = url
        if (record.titleSource === 'automatic' && changes.title === undefined) {
          record.title = automaticTitle(url)
        }
      }
      if (changes.title !== undefined) {
        record.title = validateTitle(changes.title)
        record.titleSource = 'custom'
      }
      if (changes.tags !== undefined) record.tags = normalizeTags(changes.tags)
      if (changes.notes !== undefined) record.notes = validateNotes(changes.notes)
      return { state, meta: { didWrite: true, affectedProjectId: project.id, affectedSavedUrlId: record.id } }
    }
    case 'REORDER_SAVED_URL': {
      const project = findProject(state, command.projectId)
      const from = project.savedUrls.findIndex((item) => item.id === command.savedUrlId)
      if (from < 0) throw new DomainError('That saved URL no longer exists.', 'SAVED_URL_NOT_FOUND')
      project.savedUrls = moveItem(project.savedUrls, from, command.toIndex)
      return { state, meta: { didWrite: from !== command.toIndex, affectedProjectId: project.id, affectedSavedUrlId: command.savedUrlId } }
    }
    case 'COPY_SAVED_URL': {
      const source = findProject(state, command.sourceProjectId)
      const target = resolveSaveTarget(state, command.targetProjectId, createId)
      const record = findSavedUrl(source, command.savedUrlId)
      const existing = target.savedUrls.find((item) => item.url === record.url)
      if (existing) {
        return {
          state: current,
          meta: { didWrite: false, affectedProjectId: target.id, existingSavedUrlId: existing.id },
        }
      }
      const copiedId = createId()
      target.savedUrls.push({ ...structuredClone(record), id: copiedId })
      return { state, meta: { didWrite: true, affectedProjectId: target.id, affectedSavedUrlId: copiedId } }
    }
    case 'DELETE_SAVED_URL': {
      const project = findProject(state, command.projectId)
      const index = project.savedUrls.findIndex((item) => item.id === command.savedUrlId)
      if (index < 0) throw new DomainError('That saved URL no longer exists.', 'SAVED_URL_NOT_FOUND')
      project.savedUrls.splice(index, 1)
      return { state, meta: { didWrite: true, affectedProjectId: project.id } }
    }
    case 'ARCHIVE_SAVED_URL': {
      const project = findProject(state, command.projectId)
      const record = findSavedUrl(project, command.savedUrlId)
      record.archivedAt = command.archived ? Date.now() : null
      return { state, meta: { didWrite: true, affectedProjectId: project.id, affectedSavedUrlId: record.id } }
    }
    case 'ARCHIVE_PROJECT': {
      const affectedProjectIds = subtreeIds(state, command.projectId)
      for (const id of affectedProjectIds) {
        const project = findProject(state, id)
        project.archivedAt = command.archived ? Date.now() : null
      }
      return { state, meta: { didWrite: true, affectedProjectId: command.projectId, affectedProjectIds } }
    }
    case 'FILE_LIVE_TAB': {
      const target = resolveSaveTarget(state, command.projectId, createId)
      const url = serializeHttpUrl(command.url)
      const existing = target.savedUrls.find((item) => item.url === url)
      if (existing) {
        return {
          state: current,
          meta: {
            didWrite: false,
            affectedProjectId: target.id,
            existingSavedUrlId: existing.id,
            affectedSavedUrlId: existing.id,
            filing: 'reused',
          },
        }
      }
      const capturedTitle = command.capturedTitle?.trim()
      const savedUrlId = createId()
      const record: SavedUrl = {
        id: savedUrlId,
        url,
        title: capturedTitle ? validateTitle(capturedTitle) : automaticTitle(url),
        titleSource: 'automatic',
        tags: normalizeTags(command.suggestedTags),
        notes: validateNotes(command.notes ?? ''),
        archivedAt: null,
      }
      target.savedUrls.push(record)
      return {
        state,
        meta: {
          didWrite: true,
          affectedProjectId: target.id,
          affectedSavedUrlId: savedUrlId,
          filing: 'created',
        },
      }
    }
  }
}

/** Rebuilds the flat array so the reordered sibling group appears (in the new order) at its first position. */
function rebaseSiblingGroup<T extends { id: string }>(projects: T[], reordered: T[]): T[] {
  const group = new Set(reordered.map((item) => item.id))
  const result: T[] = []
  let inserted = false
  for (const item of projects) {
    if (group.has(item.id)) {
      if (!inserted) {
        result.push(...reordered)
        inserted = true
      }
    } else {
      result.push(item)
    }
  }
  if (!inserted) result.push(...reordered)
  return result
}
