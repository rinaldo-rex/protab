import { Archive, ChevronDown, FileText, MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { tinykeys } from 'tinykeys'
import type { SavedUrl, Project } from '../domain/types'
import { CopyUrlDialog } from './CopyUrlDialog'
import { TagEditor } from './TagEditor'
import { ActionMenu } from './ActionMenu'
import { ConfirmDialog } from './ConfirmDialog'
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog'
import { ContextMenu } from './ContextMenu'
import type { WorkspaceModel } from './useWorkspace'
import type { LiveTabsModel } from './useLiveTabs'

interface SavedUrlAccordionProps {
  projectId: string
  record: SavedUrl
  index: number
  count: number
  expanded: boolean
  model: WorkspaceModel
  liveTabs: LiveTabsModel
  instanceCount: number
  projects: Project[]
  tagSuggestions: string[]
  archived?: boolean
  onToggle: (id: string, open: boolean) => void
  onNavigate: (projectId: string, recordId: string) => void
  onDeleted: (index: number) => void
}

type FieldName = 'url' | 'title' | 'notes'

export function SavedUrlAccordion({ projectId, record, index, count, expanded, model, liveTabs, instanceCount, projects, tagSuggestions, archived, onToggle, onNavigate, onDeleted }: SavedUrlAccordionProps) {
  const [url, setUrl] = useState(record.url)
  const [title, setTitle] = useState(record.title)
  const [notes, setNotes] = useState(record.notes)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [isHovering, setIsHovering] = useState(false)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLButtonElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => { setUrl(record.url); setTitle(record.title); setNotes(record.notes) }, [record])

  // tinykeys shortcuts scoped to this accordion
  useEffect(() => {
    const el = articleRef.current
    if (!el) return
    const unsubscribe = tinykeys(el, {
      'r': (event: KeyboardEvent) => {
        if (!isHovering || isTextInput(event.target)) return
        event.preventDefault()
        handleArchiveAction()
      },
      'n': (event: KeyboardEvent) => {
        if (!isHovering || isTextInput(event.target)) return
        event.preventDefault()
        if (!expanded) {
          onToggle(record.id, true)
          queueMicrotask(() => notesRef.current?.focus())
        } else {
          notesRef.current?.focus()
        }
      },
    })
    return unsubscribe
  })

  async function save(field: FieldName) {
    const value = field === 'url' ? url : field === 'title' ? title : notes
    if (value === record[field]) return true
    try {
      await model.execute({ type: 'UPDATE_SAVED_URL', projectId, savedUrlId: record.id, changes: { [field]: value } })
      setErrors((current) => ({ ...current, [field]: undefined }))
      return true
    } catch (reason) {
      setErrors((current) => ({ ...current, [field]: reason instanceof Error ? reason.message : 'Could not save this edit.' }))
      return false
    }
  }

  async function collapse() {
    if (!expanded) { onToggle(record.id, true); return }
    const results = await Promise.all([save('url'), save('title'), save('notes')])
    if (results.every(Boolean)) onToggle(record.id, false)
  }

  async function remove() {
    try {
      await model.execute({ type: 'DELETE_SAVED_URL', projectId, savedUrlId: record.id })
      setDeleting(false)
      onDeleted(index)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Could not delete this URL.')
    }
  }

  async function move(toIndex: number) {
    await model.execute({ type: 'REORDER_SAVED_URL', projectId, savedUrlId: record.id, toIndex })
    setMenuOpen(false)
    queueMicrotask(() => headerRef.current?.focus())
  }

  const handleArchiveAction = useCallback(() => {
    if (archived) {
      liveTabs.unarchive(projectId, record.id)
    } else if (instanceCount > 0) {
      setArchiveConfirm(true)
    } else {
      liveTabs.archive(projectId, record.id)
    }
  }, [archived, instanceCount, liveTabs, projectId, record.id])

  const handleArchiveAndClose = useCallback(() => {
    liveTabs.archive(projectId, record.id)
    setArchiveConfirm(false)
  }, [liveTabs, projectId, record.id])

  const handleArchiveOnly = useCallback(() => {
    liveTabs.archive(projectId, record.id)
    setArchiveConfirm(false)
  }, [liveTabs, projectId, record.id])

  const isTextInput = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || target.isContentEditable
  }, [])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }, [])

  const contextMenuItems = archived
    ? [
        { label: 'Unarchive', icon: <Archive size={14} />, onClick: () => liveTabs.unarchive(projectId, record.id) },
      ]
    : [
        { label: 'Archive', icon: <Archive size={14} />, onClick: handleArchiveAction },
      ]

  return (
    <article
      ref={articleRef}
      className={`url-accordion${archived ? ' archived-badge' : ''}`}
      data-record-id={record.id}
      tabIndex={0}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onContextMenu={handleContextMenu}
    >
      <div className="accordion-header">
        <button ref={headerRef} className="accordion-toggle" aria-expanded={expanded} aria-controls={`saved-url-${record.id}`} onClick={() => void collapse()}>
          <FileText size={18} />
          <span className="record-summary"><strong>{record.title}</strong>{record.tags.length > 0 && <span className="tag-summary">{record.tags.slice(0, 2).join(' · ')}{record.tags.length > 2 ? ` +${record.tags.length - 2}` : ''}</span>}</span>
          <ChevronDown size={18} className={expanded ? 'chevron expanded' : 'chevron'} />
        </button>
        <div className="record-actions">
          {isHovering && (
            <div className="shortcut-hints">
              <span className="shortcut-hint">{archived ? 'Unarchive (R)' : 'Archive (R)'}</span>
              <span className="shortcut-hint">Note (N)</span>
            </div>
          )}
          {instanceCount > 0 && <span className="instance-count" aria-label={`${instanceCount} open ${instanceCount === 1 ? 'instance' : 'instances'}`}>{instanceCount} open</span>}
          <button className="open-url-button" onClick={(event) => event.shiftKey ? liveTabs.openCopy(projectId, record.id) : liveTabs.open(projectId, record.id)}>Open</button>
          <button ref={triggerRef} className="icon-button" aria-label={`Saved URL actions for ${record.title}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Saved URL actions" onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={18} /></button>
          <ActionMenu label={`Actions for ${record.title}`} open={menuOpen} onClose={() => { setMenuOpen(false); queueMicrotask(() => triggerRef.current?.focus()) }}>
            <button role="menuitem" onClick={() => { setMenuOpen(false); handleArchiveAction(); queueMicrotask(() => triggerRef.current?.focus()) }}>
              <Archive size={14} /> {archived ? 'Unarchive' : 'Archive'}
            </button>
            <div role="separator" className="menu-separator" />
            <button role="menuitem" onClick={() => { setMenuOpen(false); liveTabs.openCopy(projectId, record.id); queueMicrotask(() => triggerRef.current?.focus()) }}>Open another copy</button>
            <button role="menuitem" disabled={index === 0} onClick={() => void move(index - 1)}>Move up</button>
            <button role="menuitem" disabled={index === count - 1} onClick={() => void move(index + 1)}>Move down</button>
            <button role="menuitem" onClick={() => { setMenuOpen(false); setCopying(true) }}>Copy to project…</button>
            <button role="menuitem" className="danger-text" onClick={() => { setMenuOpen(false); setDeleting(true) }}>Delete URL</button>
          </ActionMenu>
        </div>
      </div>
      {expanded && (
        <div id={`saved-url-${record.id}`} className="accordion-body">
          <label><span>URL</span><input value={url} aria-invalid={Boolean(errors.url)} onChange={(event) => setUrl(event.target.value)} onBlur={() => void save('url')} />{errors.url && <small role="alert">{errors.url}</small>}</label>
          <label><span>Title</span><input value={title} maxLength={200} aria-invalid={Boolean(errors.title)} onChange={(event) => setTitle(event.target.value)} onBlur={() => void save('title')} />{errors.title && <small role="alert">{errors.title}</small>}</label>
          <div className="metadata-note">{record.titleSource === 'automatic' ? 'Automatic hostname title' : 'Custom title'}</div>
          <TagEditor value={record.tags} suggestions={tagSuggestions} onChange={async (tags) => { await model.execute({ type: 'UPDATE_SAVED_URL', projectId, savedUrlId: record.id, changes: { tags } }) }} />
          <label><span>Notes</span><textarea ref={notesRef} value={notes} maxLength={4000} rows={4} aria-invalid={Boolean(errors.notes)} onChange={(event) => setNotes(event.target.value)} onBlur={() => void save('notes')} />{errors.notes && <small role="alert">{errors.notes}</small>}</label>
          <p className="autosave-note">Changes save when you leave a field.</p>
        </div>
      )}
      {copying && <CopyUrlDialog sourceProjectId={projectId} savedUrlId={record.id} projects={projects} model={model} onCancel={() => { setCopying(false); queueMicrotask(() => triggerRef.current?.focus()) }} onComplete={(targetProjectId, targetRecordId) => { setCopying(false); onNavigate(targetProjectId, targetRecordId) }} />}
      {deleting && <ConfirmDialog title={`Delete "${record.title}"?`} confirmLabel="Delete URL" destructive pending={model.commandPending} onCancel={() => { setDeleting(false); queueMicrotask(() => triggerRef.current?.focus()) }} onConfirm={() => void remove()}><p>This removes the saved URL and its metadata. It does not affect browser tabs.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}</ConfirmDialog>}
      {archiveConfirm && <ArchiveConfirmDialog title={record.title} onArchiveAndClose={handleArchiveAndClose} onArchiveOnly={handleArchiveOnly} onCancel={() => setArchiveConfirm(false)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </article>
  )
}
