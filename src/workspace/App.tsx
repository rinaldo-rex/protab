import { useMemo, useState, type FormEvent } from 'react'
import { AddUrlForm } from './AddUrlForm'
import { SavedUrlAccordion } from './SavedUrlAccordion'
import { Folder, FolderOpen, Plus } from 'lucide-react'
import { ProjectActions } from './ProjectActions'
import type { WorkspaceClient } from './client'
import { ChromeWorkspaceClient } from './client'
import { useWorkspace } from './useWorkspace'

interface AppProps {
  client?: WorkspaceClient
}

export function App({ client }: AppProps) {
  const resolvedClient = useMemo(() => client ?? new ChromeWorkspaceClient(), [client])
  const model = useWorkspace(resolvedClient)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [formError, setFormError] = useState<string>()
  const [focusProjectId, setFocusProjectId] = useState<string>()
  const [expandedUrlIds, setExpandedUrlIds] = useState<Set<string>>(new Set())

  if (model.status === 'loading') {
    return <main className="centered-state" aria-live="polite"><div className="loader" /><h1>Loading Protab</h1><p>Preparing your local workspace…</p></main>
  }

  if (model.status === 'storage-error') {
    return (
      <main className="centered-state storage-error" role="alert">
        <h1>Protab can’t safely open this data</h1>
        <p>{model.error}</p>
        <p>Your stored value has been left untouched. Protab is read-only until the storage issue is resolved.</p>
      </main>
    )
  }

  const state = model.state!
  const projectIds = state.projects.map((project) => project.id)
  const selected = state.projects.find((project) => project.id === model.selectedProjectId)

  async function createProject(event: FormEvent) {
    event.preventDefault()
    setFormError(undefined)
    try {
      await model.execute({ type: 'CREATE_PROJECT', name: projectName })
      setProjectName('')
      setCreating(false)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Could not create this project.')
    }
  }

  return (
    <div className="app-shell">
      <aside className="project-sidebar" aria-label="Project navigation">
        <div className="brand"><span>Protab</span><small>LOCAL WORKSPACE</small></div>
        <div className="sidebar-heading"><span>Projects</span><span>{state.projects.length}</span></div>
        <nav className="project-list" aria-label="Projects">
          {state.projects.map((project) => (
            <div key={project.id} className={project.id === selected?.id ? 'project-row selected' : 'project-row'}>
              <button
                className="project-item"
                aria-current={project.id === selected?.id ? 'page' : undefined}
                autoFocus={project.id === focusProjectId}
                onFocus={() => setFocusProjectId(undefined)}
                onClick={() => model.selectProject(project.id)}
              >
                {project.id === selected?.id ? <FolderOpen size={16} /> : <Folder size={16} />}
                <span>{project.name}</span>
              </button>
            </div>
          ))}
        </nav>
        {creating ? (
          <form className="new-project-form" onSubmit={(event) => void createProject(event)}>
            <label htmlFor="new-project-name">Project name</label>
            <input id="new-project-name" autoFocus value={projectName} maxLength={80} onChange={(event) => setProjectName(event.target.value)} />
            {formError && <p className="field-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={() => { setCreating(false); setFormError(undefined) }}>Cancel</button>
              <button type="submit" className="button primary" disabled={model.commandPending}>Create</button>
            </div>
          </form>
        ) : (
          <button className="new-project-button" onClick={() => setCreating(true)}><Plus size={17} /> New project</button>
        )}
      </aside>

      <main className="workspace">
        <header className="topbar"><h1>Project Workspace</h1><span className="local-status">Stored locally</span></header>
        {model.error && <div className="error-banner" role="alert"><span>{model.error}</span><button onClick={model.dismissError}>Dismiss</button></div>}
        <div className="workspace-body">
          <section className="project-canvas" aria-labelledby="project-title">
            {selected ? (
              <>
                <div className="canvas-header"><div><p className="eyebrow">Selected project</p><h2 id="project-title">{selected.name}</h2></div><div className="canvas-actions"><AddUrlForm projectId={selected.id} model={model} onCreated={(id) => { setExpandedUrlIds((current) => new Set(current).add(id)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${id}"] .accordion-toggle`)?.focus()) }} /><ProjectActions project={selected} projectIndex={state.projects.findIndex((project) => project.id === selected.id)} projectCount={state.projects.length} model={model} onDeleted={(deletedIndex) => {
                  const remainingIds = projectIds.filter((id) => id !== selected.id)
                  const successorId = remainingIds[deletedIndex] ?? remainingIds[deletedIndex - 1]
                  if (successorId) {
                    model.selectProject(successorId)
                    setFocusProjectId(successorId)
                  } else {
                    setCreating(false)
                    queueMicrotask(() => document.querySelector<HTMLButtonElement>('.new-project-button')?.focus())
                  }
                }} /></div></div>
                {selected.savedUrls.length === 0 ? (
                  <div className="empty-project">
                    <FolderOpen size={30} />
                    <h3>No saved URLs yet</h3>
                    <p>Add URLs manually to build durable project context. Live-tab filing arrives in a later phase.</p>
                  </div>
                ) : (
                  <div className="url-list" aria-label={`Saved URLs in ${selected.name}`}>
                    {selected.savedUrls.map((record, index) => (
                      <SavedUrlAccordion key={record.id} projectId={selected.id} record={record} index={index} count={selected.savedUrls.length} expanded={expandedUrlIds.has(record.id)} model={model} onToggle={(id, open) => setExpandedUrlIds((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next })} onDeleted={(deletedIndex) => {
                        const remaining = selected.savedUrls.filter((item) => item.id !== record.id)
                        const nearest = remaining[deletedIndex] ?? remaining[deletedIndex - 1]
                        if (nearest) queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${nearest.id}"] .accordion-toggle`)?.focus())
                        else queueMicrotask(() => document.querySelector<HTMLButtonElement>('.canvas-actions .button.primary')?.focus())
                      }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="first-use">
                <div className="first-use-mark"><FolderOpen size={34} /></div>
                <p className="eyebrow">A calmer browser starts here</p>
                <h2 id="project-title">Turn temporary tabs into durable project context.</h2>
                <p>Create your first project, then collect URLs, titles, tags, and notes that remain available after Chrome closes.</p>
                <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} /> Create first project</button>
              </div>
            )}
          </section>
          <aside className="current-tabs" aria-labelledby="current-tabs-title">
            <div className="pane-heading"><h2 id="current-tabs-title">Current Tabs</h2><span>PHASE 2</span></div>
            <div className="tabs-empty"><div className="tab-lines"><i /><i /><i /></div><h3>Live tabs aren’t connected yet</h3><p>Phase 1 organizes saved URLs only. A later phase will show tabs from this Chrome window and their project ownership here.</p></div>
          </aside>
        </div>
      </main>
    </div>
  )
}
