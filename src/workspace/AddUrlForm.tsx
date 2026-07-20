import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { WorkspaceModel } from './useWorkspace'

interface AddUrlFormProps {
  projectId: string
  model: WorkspaceModel
  onCreated: (id: string) => void
}

export function AddUrlForm({ projectId, model, onCreated }: AddUrlFormProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    try {
      const result = await model.execute({
        type: 'CREATE_SAVED_URL',
        projectId,
        url,
        title: title || undefined,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        notes,
      })
      setUrl(''); setTitle(''); setTags(''); setNotes(''); setOpen(false)
      if (result.affectedSavedUrlId) onCreated(result.affectedSavedUrlId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add this URL.')
      const existingId = typeof reason === 'object' && reason !== null && 'existingId' in reason ? reason.existingId : undefined
      if (typeof existingId === 'string') onCreated(existingId)
    }
  }

  return (
    <div className="add-url-control">
      <button className="button primary" onClick={() => setOpen(true)}><Plus size={16} /> Add URL</button>
      {open && (
        <form className="add-url-form" onSubmit={(event) => void submit(event)}>
          <h3>Add a saved URL</h3>
          <div className="form-grid">
            <label className="full"><span>URL</span><input autoFocus type="url" value={url} onChange={(event) => setUrl(event.target.value)} aria-invalid={Boolean(error)} /></label>
            <label><span>Title <small>optional</small></span><input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
            <label><span>Tags <small>comma separated</small></span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
            <label className="full"><span>Notes <small>optional</small></span><textarea value={notes} maxLength={4000} rows={3} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="inline-actions"><button type="button" className="button secondary" onClick={() => { setOpen(false); setError(undefined) }}>Cancel</button><button type="submit" className="button primary" disabled={model.commandPending}>Add URL</button></div>
        </form>
      )}
    </div>
  )
}
