import type { Command, CommandResultMeta } from './commands'
import type { PersistedState, SavedUrl } from './types'
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
  validateProjectName,
  validateTitle,
} from './validation'

export interface ApplyResult {
  state: PersistedState
  meta: CommandResultMeta
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
      state.projects.push({ id: projectId, name: validateProjectName(command.name), savedUrls: [] })
      return { state, meta: { didWrite: true, affectedProjectId: projectId } }
    }
    case 'RENAME_PROJECT': {
      const project = findProject(state, command.projectId)
      project.name = validateProjectName(command.name)
      return { state, meta: { didWrite: true, affectedProjectId: project.id } }
    }
    case 'REORDER_PROJECT': {
      const from = state.projects.findIndex((item) => item.id === command.projectId)
      if (from < 0) throw new DomainError('That project no longer exists.', 'PROJECT_NOT_FOUND')
      state.projects = moveItem(state.projects, from, command.toIndex)
      return { state, meta: { didWrite: from !== command.toIndex, affectedProjectId: command.projectId } }
    }
    case 'DELETE_PROJECT': {
      const index = state.projects.findIndex((item) => item.id === command.projectId)
      if (index < 0) throw new DomainError('That project no longer exists.', 'PROJECT_NOT_FOUND')
      state.projects.splice(index, 1)
      return { state, meta: { didWrite: true } }
    }
    case 'CREATE_SAVED_URL': {
      const project = findProject(state, command.projectId)
      const url = serializeHttpUrl(command.url)
      assertUniqueUrl(project, url)
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
      project.savedUrls.push(record)
      return { state, meta: { didWrite: true, affectedProjectId: project.id, affectedSavedUrlId: savedUrlId } }
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
      const target = findProject(state, command.targetProjectId)
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
      const project = findProject(state, command.projectId)
      project.archivedAt = command.archived ? Date.now() : null
      return { state, meta: { didWrite: true, affectedProjectId: project.id } }
    }
    case 'FILE_LIVE_TAB': {
      const project = findProject(state, command.projectId)
      const url = serializeHttpUrl(command.url)
      const existing = project.savedUrls.find((item) => item.url === url)
      if (existing) {
        return {
          state: current,
          meta: {
            didWrite: false,
            affectedProjectId: project.id,
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
      project.savedUrls.push(record)
      return {
        state,
        meta: {
          didWrite: true,
          affectedProjectId: project.id,
          affectedSavedUrlId: savedUrlId,
          filing: 'created',
        },
      }
    }
  }
}
