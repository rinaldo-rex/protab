import { useState, type FormEvent } from 'react'
import type { Project } from '../domain/types'
import type { WorkspaceModel } from './useWorkspace'

interface CopyUrlDialogProps {
  sourceProjectId: string
  savedUrlId: string
  projects: Project[]
  model: WorkspaceModel
  onCancel: () => void
  onComplete: (projectId: string, recordId: string) => void
}

export function CopyUrlDialog({ sourceProjectId, savedUrlId, projects, model, onCancel, onComplete }: CopyUrlDialogProps) {
  const targets = projects.filter((project) => project.id !== sourceProjectId)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [error, setError] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    try {
      const result = await model.execute({ type: 'COPY_SAVED_URL', sourceProjectId, savedUrlId, targetProjectId: targetId })
      const recordId = result.affectedSavedUrlId ?? result.existingSavedUrlId
      if (recordId) onComplete(targetId, recordId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not copy this URL.')
    }
  }

  return (
    <dialog open className="dialog" aria-labelledby="copy-url-title">
      <form onSubmit={(event) => void submit(event)}>
        <div className="dialog-header"><h2 id="copy-url-title">Copy to another project</h2></div>
        <div className="dialog-body">
          {targets.length ? <label htmlFor="copy-target">Project<select id="copy-target" autoFocus value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label> : <p>Create another project before copying this URL.</p>}
          <p className="copy-note">The URL, title provenance, tags, and notes are copied once. Later edits remain independent.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={!targets.length || model.commandPending}>Copy URL</button></div>
      </form>
    </dialog>
  )
}
