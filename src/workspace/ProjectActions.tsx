import { MoreHorizontal } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import type { Project } from '../domain/types'
import type { WorkspaceModel } from './useWorkspace'
import { ActionMenu } from './ActionMenu'
import { ConfirmDialog } from './ConfirmDialog'

interface ProjectActionsProps {
  project: Project
  projectIndex: number
  projectCount: number
  model: WorkspaceModel
  onDeleted: (deletedIndex: number) => void
}

export function ProjectActions({ project, projectIndex, projectCount, model, onDeleted }: ProjectActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState<'rename' | 'delete'>()
  const [name, setName] = useState(project.name)
  const [error, setError] = useState<string>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  function closeMenu() {
    setMenuOpen(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }

  function cancelDialog() {
    setMode(undefined)
    setError(undefined)
    queueMicrotask(() => triggerRef.current?.focus())
  }

  async function rename(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    try {
      await model.execute({ type: 'RENAME_PROJECT', projectId: project.id, name })
      setMode(undefined)
      queueMicrotask(() => triggerRef.current?.focus())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not rename this project.')
      queueMicrotask(() => renameInputRef.current?.focus())
    }
  }

  async function remove() {
    try {
      await model.execute({ type: 'DELETE_PROJECT', projectId: project.id })
      setMode(undefined)
      onDeleted(projectIndex)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete this project.')
    }
  }

  async function move(toIndex: number) {
    await model.execute({ type: 'REORDER_PROJECT', projectId: project.id, toIndex })
    closeMenu()
  }

  return (
    <div className="project-actions">
      <button ref={triggerRef} className="icon-button" aria-label={`Project actions for ${project.name}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Project actions" onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={20} /></button>
      <ActionMenu label={`Actions for ${project.name}`} open={menuOpen} onClose={closeMenu}>
        <button role="menuitem" onClick={() => { setName(project.name); setMenuOpen(false); setMode('rename') }}>Rename</button>
        <button role="menuitem" disabled={projectIndex === 0} onClick={() => void move(projectIndex - 1)}>Move up</button>
        <button role="menuitem" disabled={projectIndex === projectCount - 1} onClick={() => void move(projectIndex + 1)}>Move down</button>
        <button role="menuitem" className="danger-text" onClick={() => { setMenuOpen(false); setMode('delete') }}>Delete project</button>
      </ActionMenu>
      {mode === 'rename' && (
        <dialog open className="dialog" aria-labelledby="rename-project-title">
          <form onSubmit={(event) => void rename(event)}>
            <div className="dialog-header"><h2 id="rename-project-title">Rename project</h2></div>
            <div className="dialog-body"><label htmlFor="rename-project-name">Project name</label><input ref={renameInputRef} id="rename-project-name" autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />{error && <p role="alert" className="field-error dark-error">{error}</p>}</div>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={cancelDialog}>Cancel</button><button type="submit" className="button primary" disabled={model.commandPending}>Rename</button></div>
          </form>
        </dialog>
      )}
      {mode === 'delete' && (
        <ConfirmDialog title={`Delete “${project.name}”?`} confirmLabel="Delete project" destructive pending={model.commandPending} onCancel={cancelDialog} onConfirm={() => void remove()}>
          <p>This permanently deletes the project and {project.savedUrls.length === 1 ? 'its 1 saved URL' : `its ${project.savedUrls.length} saved URLs`}. This cannot be undone.</p>
          {error && <p role="alert" className="field-error dark-error">{error}</p>}
        </ConfirmDialog>
      )}
    </div>
  )
}
