import { useMemo, useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { AddUrlForm } from './AddUrlForm'
import { SavedUrlAccordion } from './SavedUrlAccordion'
import { Folder, FolderOpen, Plus, X, Play, ChevronDown, Archive, Download, Upload, Settings, FolderInput, Edit3, Trash2, BarChart3, HelpCircle, AlertTriangle } from 'lucide-react'
import type { WorkspaceClient } from './client'
import { ConfirmDialog } from './ConfirmDialog'
import { generateExportHtml } from './export/generateHtml'
import { downloadFile, sanitizeFilename } from './export/downloadFile'
import { ChromeWorkspaceClient } from './client'
import { CurrentTabsPane, type DragPayload } from './CurrentTabsPane'
import type { LiveTabsClient } from './useLiveTabs'
import { useLiveTabs } from './useLiveTabs'
import { instanceCounts } from '../domain/ownership'
import { useWorkspace } from './useWorkspace'
import { FileTabsDialog } from './FileTabsDialog'
import { FilingSummary } from './FilingSummary'
import { AttentionBanner } from './AttentionBanner'
import { DriftReviewDialog } from './DriftReviewDialog'
import { ActivationSummary } from './ActivationSummary'
import { OpenAllSummary } from './OpenAllSummary'
import { CloseAllSummary } from './CloseAllSummary'
import { tinykeys } from 'tinykeys'
import { ContextMenu } from './ContextMenu'
import { createExportZip, getExportZipFilename } from './export/createZip'
import { parseImportFile, type ImportResult } from './export/parseImport'
import { ConfirmImportDialog } from './ConfirmImportDialog'
import { SettingsPanel } from './SettingsPanel'
import { AnalyticsPanel } from './AnalyticsPanel'
import { QuickstartPanel } from './QuickstartPanel'
import { useSettings } from './useSettings'
import { useAnalytics } from './useAnalytics'
import { getDailyQuote } from '../domain/quotes'

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null)
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const [importPending, setImportPending] = useState(false)
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null)
  const [draggingUrlId, setDraggingUrlId] = useState<string | null>(null)
  const [dragOverUrlId, setDragOverUrlId] = useState<string | null>(null)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverProjectIdForReorder, setDragOverProjectIdForReorder] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'workspace' | 'settings' | 'analytics' | 'quickstart'>('workspace')
  const [renameDialogProjectId, setRenameDialogProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string>()
  const [deleteDialogProjectId, setDeleteDialogProjectId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string>()
  const [openAllConfirmProjectId, setOpenAllConfirmProjectId] = useState<string | null>(null)
  const [settings, updateSettings] = useSettings()
  const analytics = useAnalytics()
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const isDraggingProject = useRef(false)
  const focusNotesRegistry = useRef<Map<string, () => void>>(new Map())
  const archiveActionRegistry = useRef<Map<string, () => void>>(new Map())
  const openActionRegistry = useRef<Map<string, () => void>>(new Map())
  const activeProjectId = liveTabs.activeProjectId

  // Auto-open Settings when legacy data is detected
  useEffect(() => {
    if (liveTabs.legacyDataStatus?.available && viewMode !== 'settings') {
      setViewMode('settings')
    }
  }, [liveTabs.legacyDataStatus, viewMode])

  
  const handleProjectDragStart = useCallback((projectId: string, event: React.DragEvent) => {
    // Only start drag if mouse moved > 5px
    if (!dragStartPos.current) {
      event.preventDefault()
      return
    }
    setDraggingProjectId(projectId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', projectId)
    isDraggingProject.current = true
  }, [])

  const handleProjectDragOver = useCallback((projectId: string, event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverProjectIdForReorder(projectId)
  }, [])

  const handleProjectDrop = useCallback(async (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId || !model.state) {
      setDraggingProjectId(null)
      setDragOverProjectIdForReorder(null)
      return
    }

    const fromIndex = model.state.projects.findIndex((p) => p.id === draggingProjectId)
    const toIndex = model.state.projects.findIndex((p) => p.id === targetProjectId)

    if (fromIndex >= 0 && toIndex >= 0) {
      await model.execute({
        type: 'REORDER_PROJECT',
        projectId: draggingProjectId,
        toIndex,
      })
    }

    setDraggingProjectId(null)
    setDragOverProjectIdForReorder(null)
  }, [draggingProjectId, model])

  const handleProjectDragEnd = useCallback(() => {
    setDraggingProjectId(null)
    setDragOverProjectIdForReorder(null)
    isDraggingProject.current = false
    dragStartPos.current = null
  }, [])

  const handleProjectMouseDown = useCallback((event: React.MouseEvent) => {
    dragStartPos.current = { x: event.clientX, y: event.clientY }
    isDraggingProject.current = false
  }, [])

  const handleProjectMouseMove = useCallback((projectId: string, event: React.MouseEvent) => {
    if (!dragStartPos.current || isDraggingProject.current) return
    const dx = Math.abs(event.clientX - dragStartPos.current.x)
    const dy = Math.abs(event.clientY - dragStartPos.current.y)
    if (dx > 5 || dy > 5) {
      // Start drag
      const dragEvent = new DragEvent('dragstart', { bubbles: true })
      Object.defineProperty(dragEvent, 'dataTransfer', { value: new DataTransfer() })
      handleProjectDragStart(projectId, dragEvent as unknown as React.DragEvent)
    }
  }, [handleProjectDragStart])

  const handleProjectClick = useCallback((projectId: string) => {
    if (!isDraggingProject.current) {
      model.selectProject(projectId)
      setViewMode('workspace')
    }
    dragStartPos.current = null
    isDraggingProject.current = false
  }, [model])

  // Handle project deletion: select successor and close dialog
  useEffect(() => {
    if (!liveTabs.deletedProject || !deleteDialogProjectId) return
    if (liveTabs.deletedProject.projectId !== deleteDialogProjectId) return
    const currentState = model.state!
    const deletedIndex = currentState.projects.findIndex((p) => p.id === deleteDialogProjectId)
    const currentProjectIds = currentState.projects.map((p) => p.id)
    const remainingIds = currentProjectIds.filter((id) => id !== deleteDialogProjectId)
    const successorId = remainingIds[deletedIndex] ?? remainingIds[deletedIndex - 1]
    setDeleteDialogProjectId(null)
    if (successorId) {
      model.selectProject(successorId)
      setFocusProjectId(successorId)
    } else {
      setCreating(false)
      queueMicrotask(() => document.querySelector<HTMLButtonElement>('.new-project-button')?.focus())
    }
  }, [liveTabs.deletedProject, deleteDialogProjectId, model])

  // Global keyboard shortcuts (R for archive, N for notes, O for open) - scoped to hovered accordion
  useEffect(() => {
    const unsubscribe = tinykeys(window, {
      'r': (event: KeyboardEvent) => {
        if (!hoveredRecordId) return
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        event.preventDefault()
        archiveActionRegistry.current.get(hoveredRecordId)?.()
      },
      'o': (event: KeyboardEvent) => {
        if (!hoveredRecordId) return
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        event.preventDefault()
        openActionRegistry.current.get(hoveredRecordId)?.()
      },
      'n': (event: KeyboardEvent) => {
        if (!hoveredRecordId) return
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        event.preventDefault()
        focusNotesRegistry.current.get(hoveredRecordId)?.()
      },
    })
    return unsubscribe
  }, [hoveredRecordId])

  const registerFocusNotes = useCallback((recordId: string, focusFn: () => void) => {
    focusNotesRegistry.current.set(recordId, focusFn)
  }, [])

  const registerArchiveAction = useCallback((recordId: string, archiveFn: () => void) => {
    archiveActionRegistry.current.set(recordId, archiveFn)
  }, [])

  const registerOpenAction = useCallback((recordId: string, openFn: () => void) => {
    openActionRegistry.current.set(recordId, openFn)
  }, [])

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

  // Import file handling
  const handleImportFile = useCallback(async (file: File) => {
    const result = await parseImportFile(file)
    setImportResult(result)
  }, [])

  const handleImportDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setImportDragOver(true)
  }, [])

  const handleImportDragLeave = useCallback(() => {
    setImportDragOver(false)
  }, [])

  const handleImportDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setImportDragOver(false)
    const files = event.dataTransfer.files
    if (files.length === 0) return
    await handleImportFile(files[0])
  }, [handleImportFile])

  const handleImportAllFromZip = useCallback(async () => {
    if (!importResult || importResult.kind !== 'zip') return
    setImportPending(true)
    try {
      for (const project of importResult.projects) {
        const existing = model.state?.projects.find((p) => p.name === project.name)
        if (existing) {
          // Merge into existing
          for (const url of project.savedUrls) {
            try {
              await model.execute({ type: 'CREATE_SAVED_URL', projectId: existing.id, url: url.url, title: url.title === url.url ? undefined : url.title, tags: url.tags, notes: url.notes })
            } catch {
              // Skip duplicates
            }
          }
        } else {
          // Create new
          const meta = await model.execute({ type: 'CREATE_PROJECT', name: project.name })
          const projectId = meta.affectedProjectId!
          for (const url of project.savedUrls) {
            try {
              await model.execute({ type: 'CREATE_SAVED_URL', projectId, url: url.url, title: url.title === url.url ? undefined : url.title, tags: url.tags, notes: url.notes })
            } catch {
              // Skip duplicates
            }
          }
        }
      }
      setImportResult(null)
    } finally {
      setImportPending(false)
    }
  }, [importResult, model])

  const handleMergeImport = useCallback(async () => {
    if (!importResult || importResult.kind === 'error') return
    const project = importResult.kind === 'html' ? importResult.project : importResult.projects[0]
    if (!project || !model.state) return
    setImportPending(true)
    try {
      const existingProject = model.state.projects.find((p) => p.name === project.name)
      if (existingProject) {
        for (const url of project.savedUrls) {
          try {
            await model.execute({ type: 'CREATE_SAVED_URL', projectId: existingProject.id, url: url.url, title: url.title === url.url ? undefined : url.title, tags: url.tags, notes: url.notes })
          } catch {
            // Skip duplicate URLs
          }
        }
      }
      setImportResult(null)
    } finally {
      setImportPending(false)
    }
  }, [importResult, model])

  const handleCreateNewImport = useCallback(async (suffix: string) => {
    if (!importResult || importResult.kind === 'error') return
    const project = importResult.kind === 'html' ? importResult.project : importResult.projects[0]
    if (!project) return
    setImportPending(true)
    try {
      const meta = await model.execute({ type: 'CREATE_PROJECT', name: `${project.name}${suffix}` })
      const projectId = meta.affectedProjectId!
      for (const url of project.savedUrls) {
        try {
          await model.execute({ type: 'CREATE_SAVED_URL', projectId, url: url.url, title: url.title === url.url ? undefined : url.title, tags: url.tags, notes: url.notes })
        } catch {
          // Skip duplicate URLs
        }
      }
      setImportResult(null)
    } finally {
      setImportPending(false)
    }
  }, [importResult, model])

  // Auto-import when no conflicts
  useEffect(() => {
    const projects = model.state?.projects
    if (!projects || !importResult || importResult.kind === 'error' || importPending) return
    if (importResult.kind === 'html') {
      const project = importResult.project
      const existing = projects.find((p) => p.name === project.name)
      if (!existing) {
        // Create new project
        void (async () => {
          setImportPending(true)
          try {
            const meta = await model.execute({ type: 'CREATE_PROJECT', name: project.name })
            const projectId = meta.affectedProjectId!
            for (const url of project.savedUrls) {
              try {
                await model.execute({ type: 'CREATE_SAVED_URL', projectId, url: url.url, title: url.title === url.url ? undefined : url.title, tags: url.tags, notes: url.notes })
              } catch {
                // Skip duplicates
              }
            }
            setImportResult(null)
          } finally {
            setImportPending(false)
          }
        })()
      }
    } else if (importResult.kind === 'zip') {
      const hasConflict = importResult.projects.some((p) => projects.some((ep) => ep.name === p.name))
      if (!hasConflict) {
        void handleImportAllFromZip()
      }
    }
  }, [importResult, importPending, model, handleImportAllFromZip])

  // Drag handlers for URL reordering
  const handleUrlDragStart = useCallback((recordId: string) => {
    setDraggingUrlId(recordId)
  }, [])

  const handleUrlDragOver = useCallback((recordId: string) => {
    setDragOverUrlId(recordId)
  }, [])

  const handleUrlDrop = useCallback(async (targetRecordId: string) => {
    if (!draggingUrlId || !model.state || draggingUrlId === targetRecordId) {
      setDraggingUrlId(null)
      setDragOverUrlId(null)
      return
    }

    const selectedProject = model.state.projects.find((p) => p.id === model.selectedProjectId)
    if (!selectedProject) {
      setDraggingUrlId(null)
      setDragOverUrlId(null)
      return
    }

    const activeUrls = selectedProject.savedUrls.filter((u) => !u.archivedAt)
    const fromIndex = activeUrls.findIndex((u) => u.id === draggingUrlId)
    const toIndex = activeUrls.findIndex((u) => u.id === targetRecordId)

    if (fromIndex >= 0 && toIndex >= 0) {
      await model.execute({
        type: 'REORDER_SAVED_URL',
        projectId: selectedProject.id,
        savedUrlId: draggingUrlId,
        toIndex,
      })
    }

    setDraggingUrlId(null)
    setDragOverUrlId(null)
  }, [draggingUrlId, model])

  const handleUrlDragEnd = useCallback(() => {
    setDraggingUrlId(null)
    setDragOverUrlId(null)
  }, [])

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
              <h3 id="bulk-confirm-title">Add all current tabs</h3>
              <button className="icon-button" aria-label="Close" onClick={() => { liveTabs.dismissBulkSummary(); setBulkConfirmProjectId(undefined) }}><X size={18} /></button>
            </div>
            <div className="filing-dialog-body">
              <p>Add {liveTabs.bulkPrepared.eligible} tab{liveTabs.bulkPrepared.eligible !== 1 ? 's' : ''} to <strong>{liveTabs.bulkPrepared.projectName}</strong>?</p>
              <p className="filing-honesty-note">Protab will save each URL and request Chrome to close the tab. Some pages may show a native warning.</p>
            </div>
            <div className="filing-dialog-actions">
              <button className="button secondary" onClick={() => { liveTabs.dismissBulkSummary(); setBulkConfirmProjectId(undefined) }} disabled={liveTabs.bulkPending}>Cancel</button>
              <button className="button primary" onClick={() => { liveTabs.confirmBulkFile(liveTabs.bulkPrepared!.operationId, bulkConfirmProjectId); setBulkConfirmProjectId(undefined) }} disabled={liveTabs.bulkPending}>{liveTabs.bulkPending ? 'Adding…' : 'Add all'}</button>
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
      {liveTabs.activationPrepared && (
        <DriftReviewDialog
          operation={liveTabs.activationPrepared}
          pending={liveTabs.activationPending}
          onConfirm={(operationId) => {
            liveTabs.confirmActivateProject(operationId)
          }}
          onCancel={liveTabs.cancelActivateProject}
        />
      )}
      {liveTabs.activationSummary && selected && (
        <div className="filing-summary-overlay">
          <ActivationSummary
            summary={liveTabs.activationSummary}
            projectName={selected.name}
            onDismiss={liveTabs.dismissActivationSummary}
          />
        </div>
      )}
      {liveTabs.openAllSummary && selected && (
        <div className="filing-summary-overlay">
          <OpenAllSummary
            summary={liveTabs.openAllSummary}
            projectName={selected.name}
            onDismiss={liveTabs.dismissOpenAllSummary}
          />
        </div>
      )}
      {liveTabs.closeAllPrepared && (
        <DriftReviewDialog
          operation={{
            operationId: liveTabs.closeAllPrepared.operationId,
            projectId: '',
            projectName: liveTabs.closeAllPrepared.projectName,
            otherProjectTabs: liveTabs.closeAllPrepared.total,
            driftedTabs: liveTabs.closeAllPrepared.driftedTabs,
            unassignedCount: 0,
          }}
          pending={liveTabs.closeAllPending}
          onConfirm={(operationId) => liveTabs.confirmCloseAllProjectTabs(operationId)}
          onCancel={(operationId) => liveTabs.cancelCloseAllProjectTabs(operationId)}
        />
      )}
      {liveTabs.closeAllSummary && selected && (
        <div className="filing-summary-overlay">
          <CloseAllSummary
            summary={liveTabs.closeAllSummary}
            projectName={selected.name}
            onDismiss={liveTabs.dismissCloseAllSummary}
          />
        </div>
      )}
      <aside className={`project-sidebar${settings.projectsPanePosition === 'right' ? ' order-right' : ''}`} aria-label="Project navigation">
        <div className="brand">
          <div className="brand-header">
            <span>Protab</span>
            <button
              className="icon-button settings-button"
              onClick={() => setViewMode(viewMode === 'analytics' ? 'workspace' : 'analytics')}
              aria-label="Analytics"
              title="Analytics"
            >
              <BarChart3 size={16} />
            </button>
            <button
              className="icon-button settings-button"
              onClick={() => setViewMode(viewMode === 'quickstart' ? 'workspace' : 'quickstart')}
              aria-label="Quickstart guide"
              title="Quickstart guide"
            >
              <HelpCircle size={16} />
            </button>
            <button
              className="icon-button settings-button"
              onClick={() => setViewMode(viewMode === 'settings' ? 'workspace' : 'settings')}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
        <div className="sidebar-heading">
          <span>Projects</span>
          <div className="sidebar-heading-actions">
            {state.projects.length > 0 && (
              <button
                className="icon-button sidebar-export"
                title="Export all projects"
                aria-label="Export all projects"
                onClick={() => {
                  const zip = createExportZip(state.projects)
                  downloadFile(getExportZipFilename(), zip)
                }}
              >
                <Download size={14} />
              </button>
            )}
            <span>{state.projects.length}</span>
          </div>
        </div>
        <nav className="project-list" aria-label="Projects">
          {state.projects.map((project) => {
            const isActive = project.id === activeProjectId
            const isSelected = project.id === selected?.id
            const isDragging = draggingProjectId === project.id
            const isDragOver = dragOverProjectIdForReorder === project.id
            const activeCount = project.savedUrls.filter((u) => !u.archivedAt).length
            const archivedCount = project.savedUrls.filter((u) => u.archivedAt).length
            return (
              <div
                key={project.id}
                className={`${isSelected ? 'project-row selected' : 'project-row'} ${isActive ? 'active' : ''} ${dragOverProjectId === project.id ? 'drag-over-valid' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable="true"
                onMouseDown={handleProjectMouseDown}
                onMouseMove={(e) => handleProjectMouseMove(project.id, e)}
                onDragStart={(e) => handleProjectDragStart(project.id, e)}
                onDragOver={(e) => {
                  handleDragOver(e, project.id)
                  handleProjectDragOver(project.id, e)
                }}
                onDragLeave={() => {
                  handleDragLeave(project.id)
                  if (dragOverProjectIdForReorder === project.id) setDragOverProjectIdForReorder(null)
                }}
                onDrop={(e) => {
                  handleDrop(e, project.id)
                  void handleProjectDrop(project.id)
                }}
                onDragEnd={handleProjectDragEnd}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id })
                }}
              >
                <button
                  className="project-item"
                  aria-current={isSelected ? 'page' : undefined}
                  aria-label={`${project.name}${isActive ? ' (active in this window)' : ''}`}
                  autoFocus={project.id === focusProjectId}
                  onFocus={() => setFocusProjectId(undefined)}
                  onClick={() => handleProjectClick(project.id)}
                >
                  {project.name === 'Trash' ? <Trash2 size={16} /> : isSelected ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span className="project-name">{project.name}</span>
                  {settings.showTabCounts && project.savedUrls.length > 0 && (
                    <span className="project-count">
                      ({activeCount}{archivedCount > 0 && <span className="project-count-archived"> + {archivedCount}</span>})
                    </span>
                  )}
                  {isActive && <span className="active-indicator" title="Active in this window" aria-label="Active in this window">●</span>}
                </button>
              </div>
            )
          })}
        </nav>
        {settings.showSidebarQuotes && (() => {
          const quote = getDailyQuote()
          return (
            <div className="sidebar-quote" aria-hidden="true">
              <p className="sidebar-quote-text">"{quote.text}"</p>
              <span className="sidebar-quote-author">— {quote.author}</span>
            </div>
          )
        })()}
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
        <div
          className={`import-drop-zone${importDragOver ? ' import-drag-over' : ''}`}
          onDragOver={handleImportDragOver}
          onDragLeave={handleImportDragLeave}
          onDrop={(e) => void handleImportDrop(e)}
          onClick={() => document.getElementById('import-file-input')?.click()}
          role="button"
          tabIndex={0}
          aria-label="Import project from HTML or ZIP file"
        >
          <Upload size={16} />
          <span>Drop HTML or ZIP to import</span>
          <input
            id="import-file-input"
            type="file"
            accept=".html,.htm,.zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar"><h1>Project Workspace</h1></header>
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
          {viewMode === 'analytics' ? (
            <AnalyticsPanel
              analytics={analytics}
              projectCount={state.projects.length}
              totalSavedUrls={state.projects.reduce((sum, p) => sum + p.savedUrls.length, 0)}
              focusThresholds={settings.focusThresholds}
              onBack={() => setViewMode('workspace')}
            />
          ) : viewMode === 'settings' ? (
            <SettingsPanel
              settings={settings}
              onSave={updateSettings}
              onBack={() => setViewMode('workspace')}
              migrationBackupStatus={liveTabs.migrationBackupStatus}
              migrationRestoreResult={liveTabs.migrationRestoreResult}
              migrationBackupExportedJson={liveTabs.migrationBackupExportedJson}
              onCheckMigrationBackup={liveTabs.checkMigrationBackup}
              onExportMigrationBackup={liveTabs.exportMigrationBackup}
              onRestoreMigrationBackup={liveTabs.restoreMigrationBackup}
              onDismissRestoreResult={liveTabs.dismissMigrationRestoreResult}
              onClearExportedBackupJson={liveTabs.clearExportedBackupJson}
              legacyDataStatus={liveTabs.legacyDataStatus}
              legacyImportResult={liveTabs.legacyImportResult}
              onCheckLegacyData={liveTabs.checkLegacyData}
              onImportLegacyProjects={liveTabs.importLegacyProjects}
              onDismissLegacyData={liveTabs.dismissLegacyData}
              onDismissLegacyImportResult={liveTabs.dismissLegacyImportResult}
            />
          ) : viewMode === 'quickstart' ? (
            <QuickstartPanel onBack={() => setViewMode('workspace')} />
          ) : (
          <section
            className={`project-canvas ${dragOverCanvas && selected ? 'drag-over-valid' : ''}`}
            aria-labelledby="project-title"
            onDragOver={selected ? (e) => handleDragOver(e) : undefined}
            onDragLeave={selected ? () => handleDragLeave() : undefined}
            onDrop={selected ? (e) => handleDrop(e, selected.id) : undefined}
          >
            {selected ? (
              <>
                <div className="canvas-header"><div><p className="eyebrow">Selected project{selected.id === activeProjectId ? ' · Active in this window' : ''}</p><h2 id="project-title">{selected.name}</h2></div><div className="canvas-actions">
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
                      aria-label={`Add all current tabs (${eligibleBulkCount})`}
                    >
                      <FolderInput size={16} aria-hidden="true" />
                      <span>Add all current tabs ({eligibleBulkCount})</span>
                    </button>
                  )}
                  <AddUrlForm projectId={selected.id} model={model} onCreated={(id) => { setExpandedUrlIds((current) => new Set(current).add(id)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${id}"] .accordion-toggle`)?.focus()) }} /></div></div>
                {selected.savedUrls.length === 0 ? (
                  <div className="empty-project">
                    <FolderOpen size={30} />
                    <h3>No saved URLs yet</h3>
                    <p>Add URLs manually to build durable project context. Live-tab filing arrives in a later phase.</p>
                  </div>
                ) : (
                  <>
                    {/* Active URLs */}
                    {(() => { const activeUrls = selected.savedUrls.filter((u) => !u.archivedAt); return activeUrls.length === 0 ? null : (
                      <div className="url-list" aria-label={`Active URLs in ${selected.name}`}>
                        {activeUrls.map((record, index) => (
                          <SavedUrlAccordion
                            key={record.id}
                            projectId={selected.id}
                            record={record}
                            index={index}
                            count={activeUrls.length}
                            expanded={expandedUrlIds.has(record.id)}
                            model={model}
                            liveTabs={liveTabs}
                            instanceCount={openInstanceCounts[`${selected.id}:${record.id}`] ?? 0}
                            projects={state.projects}
                            tagSuggestions={tagSuggestions}
                            onHover={setHoveredRecordId}
                            registerFocusNotes={registerFocusNotes}
                            registerArchiveAction={registerArchiveAction}
                            registerOpenAction={registerOpenAction}
                            onToggle={(id, open) => setExpandedUrlIds((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next })}
                            onNavigate={(targetProjectId, targetRecordId) => { model.selectProject(targetProjectId); setExpandedUrlIds((current) => new Set(current).add(targetRecordId)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${targetRecordId}"] .accordion-toggle`)?.focus()) }}
                            onDeleted={(deletedIndex) => {
                              const remaining = activeUrls.filter((item) => item.id !== record.id)
                              const nearest = remaining[deletedIndex] ?? remaining[deletedIndex - 1]
                              if (nearest) queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${nearest.id}"] .accordion-toggle`)?.focus())
                              else queueMicrotask(() => document.querySelector<HTMLButtonElement>('.canvas-actions .button.primary')?.focus())
                            }}
                            onDragStart={handleUrlDragStart}
                            onDragOver={handleUrlDragOver}
                            onDrop={handleUrlDrop}
                            onDragEnd={handleUrlDragEnd}
                            isDragging={draggingUrlId === record.id}
                            isDragOver={dragOverUrlId === record.id}
                          />
                        ))}
                      </div>
                    ); })()}

                    {/* Archived URLs */}
                    {(() => { const archivedUrls = selected.savedUrls.filter((u) => u.archivedAt); return archivedUrls.length === 0 ? null : (
                      <div className="archived-section">
                        <button className="archived-heading" aria-expanded={archivedExpanded} onClick={() => setArchivedExpanded(!archivedExpanded)}>
                          <Archive size={14} />
                          <span>Archived ({archivedUrls.length})</span>
                          <ChevronDown size={16} className={archivedExpanded ? 'chevron expanded' : 'chevron'} />
                        </button>
                        {archivedExpanded && (
                          <div className="url-list archived" aria-label={`Archived URLs in ${selected.name}`}>
                            {archivedUrls.map((record, index) => (
                              <SavedUrlAccordion key={record.id} projectId={selected.id} record={record} index={index} count={archivedUrls.length} expanded={expandedUrlIds.has(record.id)} model={model} liveTabs={liveTabs} instanceCount={openInstanceCounts[`${selected.id}:${record.id}`] ?? 0} projects={state.projects} tagSuggestions={tagSuggestions} archived onHover={setHoveredRecordId} registerFocusNotes={registerFocusNotes} registerArchiveAction={registerArchiveAction} registerOpenAction={registerOpenAction} onToggle={(id, open) => setExpandedUrlIds((current) => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next })} onNavigate={(targetProjectId, targetRecordId) => { model.selectProject(targetProjectId); setExpandedUrlIds((current) => new Set(current).add(targetRecordId)); queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${targetRecordId}"] .accordion-toggle`)?.focus()) }} onDeleted={(deletedIndex) => {
                                const remaining = archivedUrls.filter((item) => item.id !== record.id)
                                const nearest = remaining[deletedIndex] ?? remaining[deletedIndex - 1]
                                if (nearest) queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-record-id="${nearest.id}"] .accordion-toggle`)?.focus())
                                else queueMicrotask(() => document.querySelector<HTMLButtonElement>('.canvas-actions .button.primary')?.focus())
                              }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ); })()}
                  </>
                )}
              </>
            ) : (
              <div className="first-use">
                <div className="first-use-mark"><FolderOpen size={34} /></div>
                <p className="eyebrow">A calmer browser starts here</p>
                <h2 id="project-title">Turn temporary tabs into durable project context.</h2>
                <p>Create your first project, then collect URLs, titles, tags, and notes that remain available after Chrome closes.</p>
                <p className="first-use-hint">Click the <HelpCircle size={12} style={{ verticalAlign: '-2px' }} /> icon in the sidebar header for a guided walkthrough.</p>
                <div className="first-use-actions">
                  <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} /> Create first project</button>
                  <button className="button secondary" onClick={() => document.getElementById('import-file-input')?.click()}><Upload size={17} /> Import from file</button>
                </div>
              </div>
            )}
          </section>
          )}
          {viewMode === 'workspace' && (
          <CurrentTabsPane
            model={liveTabs}
            state={state}
            onDragStart={() => {}}
            onDragEnd={() => { setDragOverProjectId(undefined); setDragOverCanvas(false) }}
            selectedProjectId={selected?.id}
            toastDuration={settings.toastDuration}
          />
          )}
        </div>
      </main>
      {importResult && importResult.kind === 'html' && (() => {
        const project = importResult.project
        const existing = state.projects.find((p) => p.name === project.name)
        if (existing) {
          return <ConfirmImportDialog projectName={project.name} existingProjectName={existing.name} urlCount={project.savedUrls.length} onMerge={handleMergeImport} onCreateNew={handleCreateNewImport} onCancel={() => setImportResult(null)} pending={importPending} />
        }
        return null
      })()}
      {importResult && importResult.kind === 'zip' && (() => {
        const projects = importResult.projects
        const hasConflict = projects.some((p) => state.projects.some((ep) => ep.name === p.name))
        if (hasConflict) {
          return <ConfirmImportDialog projectName={projects[0].name} existingProjectName={state.projects.find((p) => p.name === projects[0].name)?.name || ''} urlCount={projects.reduce((sum, p) => sum + p.savedUrls.length, 0)} onMerge={handleImportAllFromZip} onCreateNew={handleImportAllFromZip} onCancel={() => setImportResult(null)} pending={importPending} />
        }
        return null
      })()}
      {importResult && importResult.kind === 'error' && (
        <div className="filing-dialog-backdrop" role="presentation">
          <section className="filing-dialog" role="dialog" aria-modal="true">
            <div className="filing-dialog-header"><h3>Import error</h3></div>
            <div className="filing-dialog-body"><p>{importResult.message}</p></div>
            <div className="filing-dialog-actions"><button className="button primary" onClick={() => setImportResult(null)}>OK</button></div>
          </section>
        </div>
      )}
      {renameDialogProjectId && (() => {
        const renameProject = state.projects.find((p) => p.id === renameDialogProjectId)
        if (!renameProject) return null
        return (
          <dialog open className="dialog" aria-labelledby="rename-project-title">
            <form onSubmit={async (event) => {
              event.preventDefault()
              setRenameError(undefined)
              try {
                await model.execute({ type: 'RENAME_PROJECT', projectId: renameDialogProjectId, name: renameValue })
                setRenameDialogProjectId(null)
              } catch (reason) {
                setRenameError(reason instanceof Error ? reason.message : 'Could not rename this project.')
              }
            }}>
              <div className="dialog-header"><h2 id="rename-project-title">Rename project</h2></div>
              <div className="dialog-body">
                <label htmlFor="rename-project-name">Project name</label>
                <input id="rename-project-name" autoFocus value={renameValue} maxLength={80} onChange={(event) => setRenameValue(event.target.value)} />
                {renameError && <p role="alert" className="field-error dark-error">{renameError}</p>}
              </div>
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={() => setRenameDialogProjectId(null)}>Cancel</button>
                <button type="submit" className="button primary" disabled={model.commandPending}>Rename</button>
              </div>
            </form>
          </dialog>
        )
      })()}
      {deleteDialogProjectId && (() => {
        const deleteProject = state.projects.find((p) => p.id === deleteDialogProjectId)
        if (!deleteProject) return null
        const deleteOwnedLiveCount = projectLiveCounts[deleteDialogProjectId] ?? 0
        return (
          <ConfirmDialog
            title={`Delete \u201c${deleteProject.name}\u201d?`}
            confirmLabel="Delete project"
            destructive
            pending={model.commandPending}
            onCancel={() => setDeleteDialogProjectId(null)}
            onConfirm={async () => {
              setDeleteError(undefined)
              liveTabs.deleteProject(deleteDialogProjectId)
            }}
          >
            <p>This permanently deletes the project and {deleteProject.savedUrls.length === 1 ? 'its 1 saved URL' : `its ${deleteProject.savedUrls.length} saved URLs`}. {deleteOwnedLiveCount === 1 ? 'Its 1 owned live tab will remain open and become Unassigned.' : `Its ${deleteOwnedLiveCount} owned live tabs will remain open and become Unassigned.`} Saved data deletion cannot be undone.</p>
            {deleteError && <p role="alert" className="field-error dark-error">{deleteError}</p>}
          </ConfirmDialog>
        )
      })()}
      {openAllConfirmProjectId && (() => {
        const openAllProject = state.projects.find((p) => p.id === openAllConfirmProjectId)
        if (!openAllProject) return null
        const activeCount = openAllProject.savedUrls.filter((u) => !u.archivedAt).length
        return (
          <ConfirmDialog
            title={`Open ${activeCount} tabs?`}
            confirmLabel={`Open ${activeCount} tabs`}
            pending={liveTabs.openAllPending}
            onCancel={() => setOpenAllConfirmProjectId(null)}
            onConfirm={() => {
              liveTabs.openAllProjectUrls(openAllConfirmProjectId)
              setOpenAllConfirmProjectId(null)
            }}
          >
            <p>This will open {activeCount} saved URLs from <strong>{openAllProject.name}</strong> in your current window. Already-open tabs will be focused instead of duplicated.</p>
            <div className="open-all-warning">
              <AlertTriangle size={16} />
              <span>Too many tabs may slow down your device</span>
            </div>
          </ConfirmDialog>
        )
      })()}
      {contextMenu && (() => {
        const contextProject = state.projects.find((p) => p.id === contextMenu.projectId)
        if (!contextProject) return null
        const isActive = contextProject.id === activeProjectId
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={[
              {
                label: isActive ? 'Reactivate' : 'Activate',
                icon: <Play size={14} />,
                onClick: () => liveTabs.prepareActivateProject(contextMenu.projectId),
              },
              {
                label: 'Open all active',
                icon: <FolderOpen size={14} />,
                onClick: () => {
                  const activeCount = contextProject.savedUrls.filter((u) => !u.archivedAt).length
                  if (activeCount > settings.openAllThreshold) {
                    setOpenAllConfirmProjectId(contextMenu.projectId)
                  } else {
                    liveTabs.openAllProjectUrls(contextMenu.projectId)
                  }
                },
              },
              {
                label: 'Close all',
                icon: <FolderInput size={14} />,
                onClick: () => liveTabs.prepareCloseAllProjectTabs(contextMenu.projectId),
                disabled: !isActive,
              },
              { separator: true, label: '' },
              {
                label: 'Rename',
                icon: <Edit3 size={14} />,
                onClick: () => {
                  setRenameValue(contextProject.name)
                  setRenameError(undefined)
                  setRenameDialogProjectId(contextMenu.projectId)
                },
              },
              {
                label: 'Export',
                icon: <Download size={14} />,
                onClick: () => {
                  const html = generateExportHtml(contextProject)
                  downloadFile(`protab-${sanitizeFilename(contextProject.name)}.html`, new Blob([html], { type: 'text/html' }))
                },
              },
              { separator: true, label: '' },
              {
                label: 'Delete project',
                icon: <Trash2 size={14} />,
                danger: true,
                disabled: contextProject.name === 'Trash',
                onClick: () => {
                  setDeleteError(undefined)
                  setDeleteDialogProjectId(contextMenu.projectId)
                },
              },
            ]}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}
