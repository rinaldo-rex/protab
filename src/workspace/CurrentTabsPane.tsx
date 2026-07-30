import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Archive, ChevronDown, FileText, FolderInput, Globe2, Pin, RefreshCw, Trash2, X } from 'lucide-react'
import { groupLiveTabs } from '../domain/ownership'
import { isSupportedTabUrl } from '../domain/liveTabs'
import { PROTECTION_LABELS } from '../domain/tabProtection'
import type { PersistedState } from '../domain/types'
import type { LiveTabsModel } from './useLiveTabs'
import { ContextMenu } from './ContextMenu'
import { FilingResult } from './FilingResult'
import type { LiveTabView } from '../domain/liveTabs'
import type { ProtectionReason } from '../domain/liveTabs'
import { Toast } from './Toast'

export interface DragPayload {
  tabId: number
  tabTitle: string
}

function ProtectionBadges({ reasons }: { reasons: ProtectionReason[] }) {
  if (reasons.length === 0) return null
  return (
    <span className="protection-badges" aria-label={`Protected: ${reasons.map((r) => PROTECTION_LABELS[r]).join(', ')}`}>
      {reasons.map((reason) => (
        <span key={reason} className={`protection-badge protection-badge-${reason}`}>
          {PROTECTION_LABELS[reason]}
        </span>
      ))}
    </span>
  )
}

export function CurrentTabsPane({ model, state, onDragStart, onDragEnd, selectedProjectId, toastDuration, enableAnimations }: { model: LiveTabsModel; state: PersistedState; onDragStart?: (tab: LiveTabView) => void; onDragEnd?: () => void; selectedProjectId?: string; toastDuration?: number; enableAnimations?: boolean }) {
  const inventory = model.inventory
  const groups = useMemo(() => groupLiveTabs(state, inventory?.tabs ?? []), [state, inventory?.tabs])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const group of groups) {
      if (group.preCollapsed) initial.add(group.id)
    }
    return initial
  })

  // Keep pre-collapsed groups collapsed when inventory updates
  useEffect(() => {
    setCollapsed((current) => {
      const next = new Set(current)
      let changed = false
      for (const group of groups) {
        if (group.preCollapsed && !next.has(group.id)) {
          next.add(group.id)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [groups])
  const [assigningTabId, setAssigningTabId] = useState<number>()
  const [reconciliationDismissed, setReconciliationDismissed] = useState(false)
  const [draggingTabId, setDraggingTabId] = useState<number>()
  const [hoveredTabId, setHoveredTabId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: LiveTabView } | null>(null)
  const assignmentTrigger = useRef<HTMLButtonElement>(null)

  // Animate a flying tab from source element to the workspace
  const animateFiling = useCallback((sourceElement: HTMLElement, tabTitle: string) => {
    // Skip animation if disabled
    if (enableAnimations === false) return
    
    const sourceRect = sourceElement.getBoundingClientRect()
    
    // Find the workspace content area (url-list or empty-project area)
    const workspaceTarget = document.querySelector('.url-list') || document.querySelector('.empty-project') || document.querySelector('.project-canvas')
    if (!workspaceTarget) return
    
    const targetRect = workspaceTarget.getBoundingClientRect()
    
    // Create flying tab element
    const flyingTab = document.createElement('div')
    flyingTab.className = 'flying-tab'
    flyingTab.innerHTML = `
      <div class="flying-tab-favicon">${tabTitle.charAt(0).toUpperCase()}</div>
      <span class="flying-tab-title">${tabTitle}</span>
    `
    
    // Position at source
    flyingTab.style.left = `${sourceRect.left}px`
    flyingTab.style.top = `${sourceRect.top}px`
    flyingTab.style.width = `${Math.min(sourceRect.width, 300)}px`
    
    document.body.appendChild(flyingTab)
    
    // Animate to target
    requestAnimationFrame(() => {
      flyingTab.style.transition = 'all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)'
      flyingTab.style.left = `${targetRect.left + 24}px`
      flyingTab.style.top = `${targetRect.top + 16}px`
      flyingTab.style.opacity = '0.85'
      flyingTab.style.transform = 'scale(0.92)'
    })
    
    // Remove after animation
    setTimeout(() => {
      flyingTab.remove()
    }, 450)
  }, [enableAnimations])

  // Handle hover 'A' shortcut
  const handleSilentFile = useCallback((tabId: number) => {
    if (!selectedProjectId) {
      setToast({ message: 'Select a project first.', type: 'error' })
      return
    }
    // Find the next fileable tab at the same position before filing
    let nextTabId: number | null = null
    for (const group of groups) {
      if (group.id !== 'unassigned') continue
      const fileableTabs = group.tabs.filter((t) => t.supported && t.url && isSupportedTabUrl(t.url) && (!t.ownership || t.ownership.drifted))
      const idx = fileableTabs.findIndex((t) => t.tabId === tabId)
      if (idx !== -1) {
        // Pick the tab that will take this slot after removal
        const remaining = [...fileableTabs.slice(0, idx), ...fileableTabs.slice(idx + 1)]
        nextTabId = remaining.length > 0 ? remaining[Math.min(idx, remaining.length - 1)].tabId : null
        break
      }
    }

    // Trigger animation
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement
    const tab = inventory?.tabs.find((t) => t.tabId === tabId)
    if (tabElement && tab) {
      animateFiling(tabElement, tab.title)
    }

    model.silentFileTab(tabId, selectedProjectId)
    setHoveredTabId(nextTabId)
    setToast({ message: 'Saved to project.', type: 'success' })
  }, [selectedProjectId, model, groups, inventory, animateFiling])

  // Handle hover 'P' shortcut - toggle pin
  const handleTogglePin = useCallback((tabId: number) => {
    model.toggleTabPin(tabId)
    setToast({ message: 'Pin toggled.', type: 'success' })
  }, [model])

  // Handle hover 'R' shortcut - archive
  const handleArchive = useCallback((tabId: number) => {
    const tab = inventory?.tabs.find((t) => t.tabId === tabId)
    if (!tab || !tab.supported || !tab.url) return

    if (tab.ownership && !tab.ownership.drifted) {
      // Owned tab - archive/unarchive the saved URL
      const project = state.projects.find((p) => p.id === tab.ownership!.projectId)
      const savedUrl = project?.savedUrls.find((r) => r.id === tab.ownership!.savedUrlId)
      if (savedUrl) {
        if (savedUrl.archivedAt) {
          model.unarchive(tab.ownership!.projectId, tab.ownership!.savedUrlId)
          setToast({ message: 'Unarchived.', type: 'success' })
        } else {
          model.archive(tab.ownership!.projectId, tab.ownership!.savedUrlId)
          setToast({ message: 'Archived.', type: 'success' })
        }
      }
    } else if (selectedProjectId) {
      // Unassigned tab - file to selected project and archive
      model.silentFileAndArchiveTab(tabId, selectedProjectId)
      setToast({ message: 'Filed and archived.', type: 'success' })
    } else {
      setToast({ message: 'Select a project first.', type: 'error' })
    }
  }, [inventory, state, selectedProjectId, model])

  // Handle hover 'D' shortcut - delete to Trash
  const handleDeleteToTrash = useCallback((tabId: number) => {
    const trashProject = state.projects.find((p) => p.name === 'Trash')
    if (!trashProject) {
      setToast({ message: 'Trash project not found.', type: 'error' })
      return
    }
    // Trigger animation
    const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement
    const tab = inventory?.tabs.find((t) => t.tabId === tabId)
    if (tabElement && tab) {
      animateFiling(tabElement, tab.title)
    }
    model.silentFileTab(tabId, trashProject.id)
    setToast({ message: 'Saved to Trash.', type: 'success' })
  }, [state, model, inventory, animateFiling])

  // Handle hover 'C' shortcut - close tab
  const handleCloseTab = useCallback((tabId: number) => {
    model.closeTab(tabId)
    setToast({ message: 'Tab closed.', type: 'success' })
  }, [model])

  // Keyboard listener for 'A', 'P', 'R', 'D' shortcuts
  useEffect(() => {
    if (!hoveredTabId) return

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        handleSilentFile(hoveredTabId!)
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        handleTogglePin(hoveredTabId!)
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        handleArchive(hoveredTabId!)
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault()
        handleDeleteToTrash(hoveredTabId!)
      } else if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        handleCloseTab(hoveredTabId!)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredTabId, handleSilentFile, handleTogglePin, handleArchive, handleDeleteToTrash, handleCloseTab])

  const handleDragStart = (tab: LiveTabView, event: React.DragEvent) => {
    const payload: DragPayload = { tabId: tab.tabId, tabTitle: tab.title }
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
    setDraggingTabId(tab.tabId)
    onDragStart?.(tab)

    // Use a small document icon as the drag ghost
    const ghost = document.createElement('div')
    ghost.className = 'drag-ghost-icon'
    ghost.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 10, 10)
    // Clean up after the browser has used the element
    requestAnimationFrame(() => ghost.remove())
  }

  const handleDragEnd = () => {
    setDraggingTabId(undefined)
    onDragEnd?.()
  }

  return (
    <aside className="current-tabs" aria-labelledby="current-tabs-title">
      <div className="pane-heading">
        <h2 id="current-tabs-title">Current Tabs</h2>
        <span>{inventory ? inventory.tabs.length : 'LIVE'}</span>
      </div>
      {model.actionError && <div className="tabs-warning" role="alert"><span>{model.actionError}</span><button onClick={model.dismissActionError}>Dismiss</button></div>}
      {inventory?.reconciliation && !reconciliationDismissed && <div className="reconciliation-summary" role="status"><span>Tab ownership was restored after restart: {inventory.reconciliation.matched} matched, {inventory.reconciliation.ambiguous} need review.</span><button onClick={() => setReconciliationDismissed(true)}>Dismiss</button></div>}
      {model.status === 'loading' ? (
        <div className="tabs-empty" aria-live="polite"><div className="loader" /><h3>Reading this window’s tabs</h3><p>Protab only displays tabs beside this workspace.</p></div>
      ) : inventory?.stale ? (
        <div className="tabs-error" role="alert"><AlertTriangle size={22} /><h3>Current tabs are unavailable</h3><p>{inventory.error}</p><button className="button secondary" onClick={model.retry}><RefreshCw size={14} /> Retry</button>{inventory.tabs.length > 0 && <p className="stale-note">The list below is the last successful snapshot.</p>}</div>
      ) : inventory?.tabs.length === 0 ? (
        <div className="tabs-empty"><div className="tab-lines"><i /><i /><i /></div><h3>No ordinary tabs in this window</h3><p>Open a page beside Protab and it will appear here automatically.</p></div>
      ) : null}
      {inventory && inventory.tabs.length > 0 && (
        <div className={inventory.stale ? 'live-tab-groups stale' : 'live-tab-groups'}>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.id)
            return <section className={`live-tab-group${group.id === 'unsupported' ? ' unsupported' : ''}`} key={group.id} aria-labelledby={`live-group-${group.id}`}>
              <button id={`live-group-${group.id}`} className="live-group-heading" aria-expanded={!isCollapsed} aria-controls={`live-group-list-${group.id}`} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next })}>
                <span>{group.label}</span><span>{group.tabs.length}</span><ChevronDown size={14} className={isCollapsed ? 'group-chevron collapsed' : 'group-chevron'} />
              </button>
              {!isCollapsed && <ul id={`live-group-list-${group.id}`} className="live-tab-list" aria-label={`${group.label} tabs`}>
                {group.tabs.map((tab) => {
                  const isFileable = group.id === 'unassigned' && tab.supported && tab.url && isSupportedTabUrl(tab.url) && (!tab.ownership || tab.ownership.drifted)
                  const isDragging = draggingTabId === tab.tabId
                  const isHovered = hoveredTabId === tab.tabId
                  return (
                    <li key={tab.tabId}>
                      <div
                        data-tab-id={tab.tabId}
                        className={`live-tab-row-container ${isDragging ? 'dragging' : ''} ${isHovered ? 'hovered' : ''} ${tab.isProtected ? 'protected' : ''}`}
                        onMouseEnter={() => setHoveredTabId(tab.tabId)}
                        onMouseLeave={() => setHoveredTabId(null)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY, tab })
                        }}
                      >
                        <button
                          className={`live-tab-row${tab.isProtected ? ' protected' : ''}`}
                          aria-current={tab.active ? 'page' : undefined}
                          aria-label={`${tab.title}. ${tab.url ?? tab.urlSummary}. ${tab.active ? 'Current tab. ' : ''}${tab.isProtected ? `Protected: ${tab.protectionReasons.map((r) => PROTECTION_LABELS[r]).join(', ')}. ` : ''}${tab.ownership?.drifted ? 'Navigated from saved URL. Unassigned.' : tab.ownership ? `Owned by ${group.label}.` : tab.supported ? 'Unassigned.' : 'Unsupported page — view only.'}`}
                          onClick={() => model.focus(tab.tabId)}
                          draggable={isFileable ? 'true' : undefined}
                          onDragStart={isFileable ? (e) => handleDragStart(tab, e) : undefined}
                          onDragEnd={isFileable ? handleDragEnd : undefined}
                        >
                          {isDragging ? (
                            <span className="drag-placeholder-hint">
                              <FileText size={14} aria-hidden="true" />
                              <span>Drag into a project</span>
                            </span>
                          ) : (<>
                          {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} /> : <Globe2 aria-hidden="true" size={18} />}
                          <span className="live-tab-copy"><strong title={tab.title}>{tab.title}</strong><small title={tab.url}>{tab.urlSummary}</small><span>{tab.active ? 'Current tab · ' : ''}{tab.ownership?.drifted ? 'Navigated from saved URL' : tab.ownership ? `Owned by ${group.label}` : tab.candidates.length > 1 ? `Matches ${new Set(tab.candidates.map((candidate) => candidate.projectId)).size} projects — assignment needed` : tab.supported ? '' : 'Unsupported page — view only'}</span></span>
                          </>)}
                        </button>
                        <div className="live-tab-actions">
                          <ProtectionBadges reasons={tab.protectionReasons} />
                        </div>
                        {isFileable && isHovered && (
                          <span className="hover-hint" aria-hidden="true">Add (A)</span>
                        )}
                        {!tab.ownership && tab.candidates.length > 0 && <button ref={assigningTabId === tab.tabId ? assignmentTrigger : undefined} className="assign-button" aria-haspopup="dialog" onClick={() => setAssigningTabId(tab.tabId)}>Assign to…</button>}
                      </div>
                      {model.filingResult && model.filingResult.tabId === tab.tabId && (
                        <FilingResult
                          result={model.filingResult}
                          onRetry={model.retryFileOperation}
                          onDismiss={model.dismissFilingResult}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>}
            </section>
          })}
        </div>
      )}
      {assigningTabId !== undefined && (() => {
        const tab = inventory?.tabs.find((candidate) => candidate.tabId === assigningTabId)
        if (!tab) return null
        return <div className="assignment-backdrop" role="presentation"><section className="assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-title">
          <h3 id="assignment-title">Assign "{tab.title}" to…</h3>
          <p>This keeps the browser tab open and does not change saved metadata.</p>
          <div className="assignment-choices">{tab.candidates.map((candidate) => {
            const project = state.projects.find((item) => item.id === candidate.projectId)
            const record = project?.savedUrls.find((item) => item.id === candidate.savedUrlId)
            if (!project || !record) return null
            return <button key={`${candidate.projectId}:${candidate.savedUrlId}`} onClick={() => { model.assign(tab.tabId, candidate.projectId, candidate.savedUrlId); setAssigningTabId(undefined) }}><strong>{project.name}</strong><span>{record.title}</span></button>
          })}</div>
          <button className="button secondary" autoFocus onClick={() => { setAssigningTabId(undefined); queueMicrotask(() => assignmentTrigger.current?.focus()) }}>Cancel</button>
        </section></div>
      })()}
      {contextMenu && (() => {
        const { tab } = contextMenu
        const isFileable = tab.supported && tab.url && isSupportedTabUrl(tab.url) && (!tab.ownership || tab.ownership.drifted)
        const isManualPin = tab.protectionReasons.includes('manual-pin')
        const isOwned = tab.ownership && !tab.ownership.drifted
        const items = []
        if (isFileable && state.projects.length > 0) {
          items.push({
            label: 'File to project',
            icon: <FolderInput size={14} />,
            submenu: state.projects.map((project) => ({
              label: project.name,
              onClick: () => {
                // Trigger animation
                const tabElement = document.querySelector(`[data-tab-id="${tab.tabId}"]`) as HTMLElement
                if (tabElement) {
                  animateFiling(tabElement, tab.title)
                }
                model.silentFileTab(tab.tabId, project.id)
              },
            })),
          })
        }
        if (tab.supported && tab.url) {
          if (isOwned) {
            // Owned tab - show archive/unarchive
            const project = state.projects.find((p) => p.id === tab.ownership!.projectId)
            const savedUrl = project?.savedUrls.find((r) => r.id === tab.ownership!.savedUrlId)
            if (savedUrl) {
              items.push({
                label: savedUrl.archivedAt ? 'Unarchive' : 'Archive',
                icon: <Archive size={14} />,
                shortcut: 'R',
                onClick: () => {
                  if (savedUrl.archivedAt) {
                    model.unarchive(tab.ownership!.projectId, tab.ownership!.savedUrlId)
                  } else {
                    model.archive(tab.ownership!.projectId, tab.ownership!.savedUrlId)
                  }
                },
              })
            }
          } else if (isFileable) {
            // Unassigned tab - file + archive
            items.push({
              label: 'Archive',
              icon: <Archive size={14} />,
              shortcut: 'R',
              onClick: () => {
                if (selectedProjectId) {
                  model.silentFileAndArchiveTab(tab.tabId, selectedProjectId)
                } else {
                  setToast({ message: 'Select a project first.', type: 'error' })
                }
              },
            })
          }
          // Delete to Trash
          items.push({
            label: 'Delete to Trash',
            icon: <Trash2 size={14} />,
            shortcut: 'D',
            onClick: () => {
              const trashProject = state.projects.find((p) => p.name === 'Trash')
              if (trashProject) {
                // Trigger animation
                const tabElement = document.querySelector(`[data-tab-id="${tab.tabId}"]`) as HTMLElement
                if (tabElement) {
                  animateFiling(tabElement, tab.title)
                }
                model.silentFileTab(tab.tabId, trashProject.id)
              } else {
                setToast({ message: 'Trash project not found.', type: 'error' })
              }
            },
          })
          // Pin/Unpin
          items.push({
            label: isManualPin ? 'Unpin tab' : 'Pin tab',
            icon: <Pin size={14} />,
            shortcut: 'P',
            onClick: () => model.toggleTabPin(tab.tabId),
          })
          // Close tab
          items.push({
            label: 'Close tab',
            icon: <X size={14} />,
            shortcut: 'C',
            onClick: () => model.closeTab(tab.tabId),
          })
        }
        if (items.length === 0) return null
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toastDuration ?? 3000}
          onDismiss={() => setToast(null)}
        />
      )}
    </aside>
  )
}
