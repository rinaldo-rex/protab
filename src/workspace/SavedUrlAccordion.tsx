import { ChevronDown, FileText, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SavedUrl, Project } from '../domain/types'
import { CopyUrlDialog } from './CopyUrlDialog'
import { TagEditor } from './TagEditor'
import { ActionMenu } from './ActionMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { WorkspaceModel } from './useWorkspace'

interface SavedUrlAccordionProps {
  projectId: string
  record: SavedUrl
  index: number
  count: number
  expanded: boolean
  model: WorkspaceModel
  projects: Project[]
  tagSuggestions: string[]
  onToggle: (id: string, open: boolean) => void
  onNavigate: (projectId: string, recordId: string) => void
  onDeleted: (index: number) => void
}

type FieldName = 'url' | 'title' | 'notes'

export function SavedUrlAccordion({ projectId, record, index, count, expanded, model, projects, tagSuggestions, onToggle, onNavigate, onDeleted }: SavedUrlAccordionProps) {
  const [url, setUrl] = useState(record.url)
  const [title, setTitle] = useState(record.title)
  const [notes, setNotes] = useState(record.notes)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setUrl(record.url); setTitle(record.title); setNotes(record.notes) }, [record])

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

  return (
    <article className="url-accordion" data-record-id={record.id}>
      <div className="accordion-header">
        <button ref={headerRef} className="accordion-toggle" aria-expanded={expanded} aria-controls={`saved-url-${record.id}`} onClick={() => void collapse()}>
          <FileText size={18} />
          <span className="record-summary"><strong>{record.title}</strong>{record.tags.length > 0 && <span className="tag-summary">{record.tags.slice(0, 2).join(' · ')}{record.tags.length > 2 ? ` +${record.tags.length - 2}` : ''}</span>}</span>
          <ChevronDown size={18} className={expanded ? 'chevron expanded' : 'chevron'} />
        </button>
        <div className="record-actions">
          <button ref={triggerRef} className="icon-button" aria-label={`Saved URL actions for ${record.title}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Saved URL actions" onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={18} /></button>
          <ActionMenu label={`Actions for ${record.title}`} open={menuOpen} onClose={() => { setMenuOpen(false); queueMicrotask(() => triggerRef.current?.focus()) }}>
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
          <label><span>Notes</span><textarea value={notes} maxLength={4000} rows={4} aria-invalid={Boolean(errors.notes)} onChange={(event) => setNotes(event.target.value)} onBlur={() => void save('notes')} />{errors.notes && <small role="alert">{errors.notes}</small>}</label>
          <p className="autosave-note">Changes save when you leave a field.</p>
        </div>
      )}
      {copying && <CopyUrlDialog sourceProjectId={projectId} savedUrlId={record.id} projects={projects} model={model} onCancel={() => { setCopying(false); queueMicrotask(() => triggerRef.current?.focus()) }} onComplete={(targetProjectId, targetRecordId) => { setCopying(false); onNavigate(targetProjectId, targetRecordId) }} />}
      {deleting && <ConfirmDialog title={`Delete “${record.title}”?`} confirmLabel="Delete URL" destructive pending={model.commandPending} onCancel={() => { setDeleting(false); queueMicrotask(() => triggerRef.current?.focus()) }} onConfirm={() => void remove()}><p>This removes the saved URL and its metadata. It does not affect browser tabs.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}</ConfirmDialog>}
    </article>
  )
}
