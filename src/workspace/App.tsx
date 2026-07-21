import { useMemo, useState, type FormEvent } from 'react'
import { AddUrlForm } from './AddUrlForm'
import { SavedUrlAccordion } from './SavedUrlAccordion'
import { Folder, FolderOpen, Plus, X } from 'lucide-react'
import { ProjectActions } from './ProjectActions'
import type { WorkspaceClient } from './client'
import { ChromeWorkspaceClient } from './client'
import { CurrentTabsPane, type DragPayload } from './CurrentTabsPane'
import type { LiveTabsClient } from './useLiveTabs'
import { useLiveTabs } from './useLiveTabs'
import { instanceCounts } from '../domain/ownership'
import { useWorkspace } from './useWorkspace'
import { FileTabsDialog } from './FileTabsDialog'
import { FilingSummary } from './FilingSummary'
import { AttentionBanner } from './AttentionBanner'
import { FolderInput } from 'lucide-react'

interface AppProps {
  client?: WorkspaceClient
  liveTabsClient?: LiveTabsClient
}

export function App({ client, liveTabsClient }: AppProps) {
  const resolvedClient = useMemo(() => client ?? new ChromeWorkspaceClient(), [client])
  const model = useWorkspace(resolvedClient)
  const liveTabs = useLiveTabs(liveTabsClient)
  const openInstanceCounts = useMemo(() => instanceCounts(liveTabs.inventory?.tabs ?? []), [liveTabs.inventory?.tabs])
  const projectLiveCounts = useMemo(() => Object.entries(openInstanceCounts).reduce<Record<string, number>>((counts, [key, count]) => { const projectId = key.split(':')[0]; counts[projectId] = (counts[projectId] ?? 0) + count; return counts }, {}), [openInstanceCounts])
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [formError, setFormError] = useState<string>()
  const [focusProjectId, setFocusProjectId] = useState<string>()
  const [expandedUrlIds, setExpandedUrlIds] = useState<Set<string>>(new Set())
  const [dragOverProjectId, setDragOverProjectId] = useState<string>()
  const [dragOverCanvas, setDragOverCanvas] = useState(false)
  const [bulkConfirmProjectId, setBulkConfirmProjectId] = useState<string>()
  const activeProjectId = liveTabs.activeProjectId

  // Count eligible unassigned tabs for bulk filing
  const eligibleBulkCount = useMemo(() => {
    if (!liveTabs.inventory?.tabs) return 0
    return liveTabs.inventory.tabs.filter((tab) => {
      if (!tab.supported || !tab.url) return false
      if (tab.ownership && !tab.ownership.drifted) return false
      return true
    }).length
  }, [liveTabs.inventory?.tabs])

  const handleDragOver = (event: React.DragEvent, projectId?: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (projectId !== undefined) {
      setDragOverProjectId(projectId)
      setDragOverCanvas(false)
    } else {
      setDragOverCanvas(true)
      setDragOverProjectId(undefined)
    }
  }

  const handleDragLeave = (projectId?: string) => {
    if (projectId !== undefined) {
      if (dragOverProjectId === projectId) setDragOverProjectId(undefined)
    } else {
      setDragOverCanvas(false)
    }
  }

  const handleDrop = (event: React.DragEvent, projectId: string) => {
    event.preventDefault()
    setDragOverProjectId(undefined)
    setDragOverCanvas(false)
    try {
      const raw = event.dataTransfer.getData('application/json')
      if (!raw) return
      const payload = JSON.parse(raw) as DragPayload
      if (payload.tabId) {
        liveTabs.prepareFileTab(payload.tabId, projectId)
      }
    } catch {
      // Invalid drag payload
    }
  }

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
  const tagSuggestions = Array.from(new Map(state.projects.flatMap((project) => project.savedUrls.flatMap((record) => record.tags)).map((tag) => [tag.toLocaleLowerCase(), tag])).values()).sort((a, b) => a.localeCompare(b))

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
      {liveTabs.preparedFiling && (
        <FileTabsDialog
          operation={liveTabs.preparedFiling}
          state={state}
          pending={liveTabs.filingPending}
          onConfirm={liveTabs.confirmFileTab}
          onCancel={liveTabs.cancelFileOperation}
        />
      )}
      {liveTabs.bulkPrepared && bulkConfirmProjectId && (
        <div className="filing-dialog-backdrop" role="presentation">
          <section className="filing-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title">
            <div className="filing-dialog-header">
              <h3 id="bulk-confirm-title">File all unassigned tabs</h3>
              <button className="icon-button" aria-label="Close" onClick={() => { liveTabs.dismissBulkSummary(); setBulkConfirmProjectId(undefined) }}><X size={18} /></button>
            </div>
            <div className="filing-dialog-body">
              <p>File {liveTabs.bulkPrepared.eligible} unassigned tab{liveTabs.bulkPrepared.eligible !== 1 ? 's' : ''} to <strong>{liveTabs.bulkPrepared.projectName}</strong>?</p>
              <p className="filing-honesty-note">Protab will save each URL and request Chrome to close the tab. Some pages may show a native warning.</p>
            </div>
            <div className="filing-dialog-actions">
              <button className="button secondary" onClick={() => { liveTabs.dismissBulkSummary(); setBulkConfirmProjectId(undefined) }} disabled={liveTabs.bulkPending}>Cancel</button>
              <button className="button primary" onClick={() => { liveTabs.confirmBulkFile(liveTabs.bulkPrepared!.operationId, bulkConfirmProjectId); setBulkConfirmProjectId(undefined) }} disabled={liveTabs.bulkPending}>{liveTabs.bulkPending ? 'Filing…' : 'File all'}</button>
            </div>
          </section>
        </div>
      )}
      {liveTabs.bulkSummary && selected && (
        <div className="filing-summary-overlay">
          <FilingSummary
            summary={liveTabs.bulkSummary}
            projectName={selected.name}
            onDismiss={liveTabs.dismissBulkSummary}
          />
        </div>
      )}
      <aside className="project-sidebar" aria-label="Project navigation">
        <div className="brand"><span>Protab</span><small>LOCAL WORKSPACE</small></div>
        <div className="sidebar-heading"><span>Projects</span><span>{state.projects.length}</span></div>
        <nav className="project-list" aria-label="Projects">
          {state.projects.map((project) => {
            const isActive = project.id === activeProjectId
            const isSelected = project.id === selected?.id
            return (
              <div
                key={project.id}
                className={`${isSelected ? 'project-row selected' : 'project-row'} ${isActive ? 'active' : ''} ${dragOverProjectId === project.id ? 'drag-over-valid' : ''}`}
                onDragOver={(e) => handleDragOver(e, project.id)}
                onDragLeave={() => handleDragLeave(project.id)}
                onDrop={(e) => handleDrop(e, project.id)}
              >
                <button
                  className="project-item"
                  aria-current={isSelected ? 'page' : undefined}
                  aria-label={`${project.name}${isActive ? ' (active)' : ''}`}
                  autoFocus={project.id === focusProjectId}
                  onFocus={() => setFocusProjectId(undefined)}
                  onClick={() => model.selectProject(project.id)}
                >
                  {isSelected ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span className="project-name">{project.name}</span>
                  {isActive && <span className="active-indicator" aria-label="Active project">●</span>}
                </button>
              </div>
            )
          })}
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
        {liveTabs.attentionItems.length > 0 && (
          <AttentionBanner
            items={liveTabs.attentionItems}
            onFocusTab={liveTabs.focus}
            onRetryClose={liveTabs.retryFileOperation}
            onDismissItem={liveTabs.dismissAttention}
            onDismissBanner={liveTabs.dismissAttentionBanner}
          />
        )}
        {model.error && <div className="error-banner" role="alert"><span>{model.error}</span><button onClick={model.dismissError}>Dismiss</button></div>}
        <div className="workspace-body">
          <section
            className={`project-canvas ${dragOverCanvas && selected ? 'drag-over-valid' : ''}`}
            aria-labelledby="project-title"
            onDragOver={selected ? (e) => handleDragOver(e) : undefined}
            onDragLeave={selected ? () => handleDragLeave() : undefined}
            onDrop={selected ? (e) => handleDrop(e, selected.id) : undefined}
          >
            {selected ? (
              <>
                <div className="canvas-header"><div><p className="eyebrow">Selected project{selected.id === activeProjectId ? ' · Active' : ''}</p><h2 id="project-title">{selected.name}</h2></div><div className="canvas-actions">
                  {eligibleBulkCount > 0 && (
                    <button
                      className="button secondary bulk-file-button"
                      onClick={() => {
                        if (liveTabs.bulkPrepared) {
                          liveTabs.confirmBulkFile(liveTabs.bulkPrepared.operationId, selected.id)
                        } else {
                          setBulkConfirmProjectId(selected.id)
                          liveTabs.prepareBulkFile(selected.id)
                        }
                      }}
                      disabled={liveTabs.bulkPending}
                      aria-label={`File all unassigned tabs (${eligibleBulkCount})`}
                    >
                      <FolderInput size={16} aria-hidden="true" />
                      <span>File all unassigned ({eligibleBulkCount})</span>
                    </button>
                  )}
                  <AddUrlForm projectId={selected.id} model={model} onCreated={(id) => { setExpandedUrlIds((current) => new Set(current).add(id)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${id}"] .accordion-toggle`)?.focus()) }} /><ProjectActions project={selected} projectIndex={state.projects.findIndex((project) => project.id === selected.id)} projectCount={state.projects.length} model={model} liveTabs={liveTabs} ownedLiveCount={projectLiveCounts[selected.id] ?? 0} onDeleted={(deletedIndex) => {
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
                      <SavedUrlAccordion key={record.id} projectId={selected.id} record={record} index={index} count={selected.savedUrls.length} expanded={expandedUrlIds.has(record.id)} model={model} liveTabs={liveTabs} instanceCount={openInstanceCounts[`${selected.id}:${record.id}`] ?? 0} projects={state.projects} tagSuggestions={tagSuggestions} onToggle={(id, open) => setExpandedUrlIds((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next })} onNavigate={(targetProjectId, targetRecordId) => { model.selectProject(targetProjectId); setExpandedUrlIds((current) => new Set(current).add(targetRecordId)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${targetRecordId}"] .accordion-toggle`)?.focus()) }} onDeleted={(deletedIndex) => {
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
          <CurrentTabsPane
            model={liveTabs}
            state={state}
            onDragStart={() => {}}
            onDragEnd={() => { setDragOverProjectId(undefined); setDragOverCanvas(false) }}
          />
        </div>
      </main>
    </div>
  )
}
