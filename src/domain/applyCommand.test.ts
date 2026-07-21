import { describe, expect, it } from 'vitest'
import { applyCommand } from './applyCommand'
import { emptyState, type PersistedState } from './types'
import { DomainError, normalizeTags, serializeHttpUrl } from './validation'

function ids(...values: string[]) {
  let index = 0
  return () => values[index++]
}

function stateWithProject(): PersistedState {
  return { schemaVersion: 2, projects: [{ id: 'p1', name: 'Research', savedUrls: [] }] }
}

describe('domain behavior', () => {
  it('trims and validates project names', () => {
    expect(applyCommand(emptyState(), { type: 'CREATE_PROJECT', name: '  Research  ' }, ids('p1')).state.projects[0].name).toBe('Research')
    expect(() => applyCommand(emptyState(), { type: 'CREATE_PROJECT', name: '   ' })).toThrowError(DomainError)
  })

  it('serializes URLs without erasing significant identity parts', () => {
    expect(serializeHttpUrl('HTTPS://Example.COM:443/Path/?b=2&a=1#Part')).toBe('https://example.com/Path/?b=2&a=1#Part')
    expect(serializeHttpUrl('https://example.com/a')).not.toBe(serializeHttpUrl('https://example.com/A'))
    expect(serializeHttpUrl('https://example.com/a?x=1#one')).not.toBe(serializeHttpUrl('https://example.com/a?x=1#two'))
    expect(() => serializeHttpUrl('file:///tmp/test')).toThrow(/HTTP and HTTPS/)
    expect(() => serializeHttpUrl('https://user:pass@example.com')).toThrow(/username or password/)
  })

  it('creates automatic and custom titles and prevents same-project duplicates', () => {
    const automatic = applyCommand(stateWithProject(), { type: 'CREATE_SAVED_URL', projectId: 'p1', url: 'https://Example.com/path' }, ids('u1')).state
    expect(automatic.projects[0].savedUrls[0]).toMatchObject({ url: 'https://example.com/path', title: 'example.com', titleSource: 'automatic' })
    expect(() => applyCommand(automatic, { type: 'CREATE_SAVED_URL', projectId: 'p1', url: 'https://EXAMPLE.com/path' })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_URL', existingId: 'u1' }))
    const custom = applyCommand(stateWithProject(), { type: 'CREATE_SAVED_URL', projectId: 'p1', url: 'https://example.com', title: 'Example' }, ids('u2')).state
    expect(custom.projects[0].savedUrls[0].titleSource).toBe('custom')
  })

  it('updates automatic titles on URL-only edits and preserves custom titles', () => {
    const created = applyCommand(stateWithProject(), { type: 'CREATE_SAVED_URL', projectId: 'p1', url: 'https://one.example' }, ids('u1')).state
    const automatic = applyCommand(created, { type: 'UPDATE_SAVED_URL', projectId: 'p1', savedUrlId: 'u1', changes: { url: 'https://two.example/path' } }).state
    expect(automatic.projects[0].savedUrls[0]).toMatchObject({ title: 'two.example', titleSource: 'automatic' })
    const custom = applyCommand(automatic, { type: 'UPDATE_SAVED_URL', projectId: 'p1', savedUrlId: 'u1', changes: { title: 'My reference' } }).state
    const moved = applyCommand(custom, { type: 'UPDATE_SAVED_URL', projectId: 'p1', savedUrlId: 'u1', changes: { url: 'https://three.example' } }).state
    expect(moved.projects[0].savedUrls[0]).toMatchObject({ title: 'My reference', titleSource: 'custom' })
    const explicit = applyCommand(created, { type: 'UPDATE_SAVED_URL', projectId: 'p1', savedUrlId: 'u1', changes: { url: 'https://two.example', title: 'Explicit' } }).state
    expect(explicit.projects[0].savedUrls[0]).toMatchObject({ title: 'Explicit', titleSource: 'custom' })
  })

  it('deduplicates tags case-insensitively while preserving first casing', () => {
    expect(normalizeTags([' Design ', 'design', 'RESEARCH'])).toEqual(['Design', 'RESEARCH'])
  })

  it('allows cross-project copies and keeps snapshots independent', () => {
    const initial: PersistedState = {
      schemaVersion: 2,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Example', titleSource: 'custom', tags: ['A'], notes: 'Source', archivedAt: null }] },
        { id: 'p2', name: 'Two', savedUrls: [] },
      ],
    }
    const copied = applyCommand(initial, { type: 'COPY_SAVED_URL', sourceProjectId: 'p1', savedUrlId: 'u1', targetProjectId: 'p2' }, ids('u2')).state
    const edited = applyCommand(copied, { type: 'UPDATE_SAVED_URL', projectId: 'p2', savedUrlId: 'u2', changes: { notes: 'Copy' } }).state
    expect(edited.projects[0].savedUrls[0].notes).toBe('Source')
    expect(edited.projects[1].savedUrls[0].notes).toBe('Copy')
    const duplicate = applyCommand(edited, { type: 'COPY_SAVED_URL', sourceProjectId: 'p1', savedUrlId: 'u1', targetProjectId: 'p2' })
    expect(duplicate.meta).toMatchObject({ didWrite: false, existingSavedUrlId: 'u2' })
  })

  it('reorders arrays and cascade deletes projects', () => {
    const initial: PersistedState = {
      schemaVersion: 2,
      projects: [
        { id: 'p1', name: 'One', savedUrls: [{ id: 'u1', url: 'https://one.test/', title: 'One', titleSource: 'automatic', tags: [], notes: '', archivedAt: null }] },
        { id: 'p2', name: 'Two', savedUrls: [] },
      ],
    }
    const reordered = applyCommand(initial, { type: 'REORDER_PROJECT', projectId: 'p2', toIndex: 0 }).state
    expect(reordered.projects.map((project) => project.id)).toEqual(['p2', 'p1'])
    const deleted = applyCommand(reordered, { type: 'DELETE_PROJECT', projectId: 'p1' }).state
    expect(deleted.projects).toEqual([{ id: 'p2', name: 'Two', savedUrls: [] }])
  })
})

describe('FILE_LIVE_TAB command', () => {
  function stateWithProject(): PersistedState {
    return { schemaVersion: 2, projects: [{ id: 'p1', name: 'Research', savedUrls: [] }] }
  }

  it('creates a new record with automatic title from hostname', () => {
    const result = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com/path', suggestedTags: [] }, ids('u1'))
    expect(result.state.projects[0].savedUrls[0]).toMatchObject({
      url: 'https://example.com/path',
      title: 'example.com',
      titleSource: 'automatic',
      tags: [],
      notes: '',
    })
    expect(result.meta).toMatchObject({ didWrite: true, affectedProjectId: 'p1', affectedSavedUrlId: 'u1', filing: 'created' })
  })

  it('uses captured title when provided and non-empty', () => {
    const result = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com', capturedTitle: '  My Page  ', suggestedTags: [] }, ids('u1'))
    expect(result.state.projects[0].savedUrls[0]).toMatchObject({
      title: 'My Page',
      titleSource: 'automatic',
    })
  })

  it('falls back to hostname when captured title is empty or whitespace', () => {
    const empty = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com/page', capturedTitle: '', suggestedTags: [] }, ids('u1'))
    expect(empty.state.projects[0].savedUrls[0].title).toBe('example.com')
    const whitespace = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://other.com', capturedTitle: '   ', suggestedTags: [] }, ids('u2'))
    expect(whitespace.state.projects[0].savedUrls[0].title).toBe('other.com')
  })

  it('applies suggested tags to new records', () => {
    const result = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com', suggestedTags: ['video', 'research'] }, ids('u1'))
    expect(result.state.projects[0].savedUrls[0].tags).toEqual(['video', 'research'])
  })

  it('normalizes suggested tags (deduplication, trimming)', () => {
    const result = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com', suggestedTags: [' Video ', 'video', 'CODE'] }, ids('u1'))
    expect(result.state.projects[0].savedUrls[0].tags).toEqual(['Video', 'CODE'])
  })

  it('returns filing: created for new records', () => {
    const result = applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com', suggestedTags: [] }, ids('u1'))
    expect(result.meta.filing).toBe('created')
    expect(result.meta.didWrite).toBe(true)
  })

  it('returns filing: reused with existing record ID when URL matches', () => {
    const state: PersistedState = {
      schemaVersion: 2,
      projects: [{
        id: 'p1',
        name: 'Research',
        savedUrls: [{ id: 'u1', url: 'https://example.com/', title: 'Custom Title', titleSource: 'custom', tags: ['manual'], notes: 'My notes', archivedAt: null }],
      }],
    }
    const result = applyCommand(state, { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com/', suggestedTags: ['video'] })
    expect(result.meta).toMatchObject({ didWrite: false, existingSavedUrlId: 'u1', affectedSavedUrlId: 'u1', filing: 'reused' })
    expect(result.state).toBe(state) // returns same state reference
  })

  it('preserves existing metadata on reuse (title, tags, notes, ordering)', () => {
    const state: PersistedState = {
      schemaVersion: 2,
      projects: [{
        id: 'p1',
        name: 'Research',
        savedUrls: [
          { id: 'u1', url: 'https://first.com/', title: 'First', titleSource: 'custom', tags: ['a'], notes: 'first notes', archivedAt: null },
          { id: 'u2', url: 'https://example.com/', title: 'Custom Title', titleSource: 'custom', tags: ['manual'], notes: 'My notes', archivedAt: null },
          { id: 'u3', url: 'https://last.com/', title: 'Last', titleSource: 'automatic', tags: ['b'], notes: '', archivedAt: null },
        ],
      }],
    }
    const result = applyCommand(state, { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://example.com/', suggestedTags: ['video'] })
    const urls = result.state.projects[0].savedUrls
    expect(urls).toHaveLength(3)
    expect(urls[1]).toMatchObject({
      id: 'u2',
      title: 'Custom Title',
      titleSource: 'custom',
      tags: ['manual'],
      notes: 'My notes',
    })
    // ordering preserved
    expect(urls.map((u) => u.id)).toEqual(['u1', 'u2', 'u3'])
  })

  it('throws on invalid/unsupported URL', () => {
    expect(() => applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'file:///tmp/test', suggestedTags: [] })).toThrow(/HTTP and HTTPS/)
    expect(() => applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'https://user:pass@example.com', suggestedTags: [] })).toThrow(/username or password/)
    expect(() => applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'p1', url: 'not-a-url', suggestedTags: [] })).toThrow(/valid/)
  })

  it('throws on missing project', () => {
    expect(() => applyCommand(stateWithProject(), { type: 'FILE_LIVE_TAB', projectId: 'missing', url: 'https://example.com', suggestedTags: [] })).toThrow(/no longer exists/)
  })
})
