import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, Download, RotateCcw } from 'lucide-react'
import type { ProtabSettings, ProjectsPanePosition } from '../domain/settings'
import { WORKSPACE_SHORTCUTS } from '../domain/settings'

interface MigrationBackupStatus {
  available: boolean
  fromSchemaVersion?: number
  toSchemaVersion?: number
  createdAt?: number
}

interface MigrationRestoreResult {
  success: boolean
  error?: string
}

interface LegacyProject {
  name: string
  urlCount: number
  archivedCount: number
}

interface LegacyDataStatus {
  available: boolean
  schemaVersion?: number
  projectCount?: number
  projects?: LegacyProject[]
}

interface SettingsPanelProps {
  settings: ProtabSettings
  onSave: (settings: Partial<ProtabSettings>) => void
  onBack: () => void
  migrationBackupStatus?: MigrationBackupStatus
  migrationRestoreResult?: MigrationRestoreResult
  migrationBackupExportedJson?: string
  onCheckMigrationBackup: () => void
  onExportMigrationBackup: () => void
  onRestoreMigrationBackup: () => void
  onDismissRestoreResult: () => void
  onClearExportedBackupJson: () => void
  // Legacy data
  legacyDataStatus?: LegacyDataStatus
  legacyImportResult?: { success: boolean; importedCount?: number; error?: string }
  onCheckLegacyData: () => void
  onImportLegacyProjects: (projectNames: string[]) => void
  onDismissLegacyData: () => void
  onDismissLegacyImportResult: () => void
}

export function SettingsPanel({
  settings,
  onSave,
  onBack,
  migrationBackupStatus,
  migrationRestoreResult,
  onCheckMigrationBackup,
  onExportMigrationBackup,
  onRestoreMigrationBackup,
  onDismissRestoreResult,
  migrationBackupExportedJson,
  onClearExportedBackupJson,
  legacyDataStatus,
  legacyImportResult,
  onCheckLegacyData,
  onImportLegacyProjects,
  onDismissLegacyData,
  onDismissLegacyImportResult,
}: SettingsPanelProps) {
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [selectedLegacyProjects, setSelectedLegacyProjects] = useState<Set<string>>(new Set())
  const [confirmImport, setConfirmImport] = useState(false)
  const [oldVersionWarningDismissed, setOldVersionWarningDismissed] = useState(false)
  const [testToastKey, setTestToastKey] = useState(0)
  const [showTestToast, setShowTestToast] = useState(false)

  // Check for migration backup on mount
  useEffect(() => {
    onCheckMigrationBackup()
    onCheckLegacyData()
  }, [onCheckMigrationBackup, onCheckLegacyData])

  // Initialize selected legacy projects when data arrives
  useEffect(() => {
    if (legacyDataStatus?.available && legacyDataStatus.projects) {
      setSelectedLegacyProjects(new Set(legacyDataStatus.projects.map((p) => p.name)))
    }
  }, [legacyDataStatus])

  const handleExportBackup = () => {
    onExportMigrationBackup()
  }

  // Auto-download when exported JSON arrives
  useEffect(() => {
    if (migrationBackupExportedJson) {
      const blob = new Blob([migrationBackupExportedJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'protab-migration-backup.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onClearExportedBackupJson()
    }
  }, [migrationBackupExportedJson, onClearExportedBackupJson])

  const handleRestoreClick = () => {
    setConfirmRestore(true)
  }

  const handleConfirmRestore = () => {
    setConfirmRestore(false)
    onRestoreMigrationBackup()
  }

  const handleCancelRestore = () => {
    setConfirmRestore(false)
  }

  const toggleLegacyProject = (name: string) => {
    setSelectedLegacyProjects((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAllLegacyProjects = () => {
    if (!legacyDataStatus?.projects) return
    if (selectedLegacyProjects.size === legacyDataStatus.projects.length) {
      setSelectedLegacyProjects(new Set())
    } else {
      setSelectedLegacyProjects(new Set(legacyDataStatus.projects.map((p) => p.name)))
    }
  }

  const handleImportLegacy = () => {
    setConfirmImport(true)
  }

  const handleConfirmImport = () => {
    setConfirmImport(false)
    onImportLegacyProjects(Array.from(selectedLegacyProjects))
  }

  const handleCancelImport = () => {
    setConfirmImport(false)
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to workspace">
          <ArrowLeft size={18} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="settings-sections">
        {/* Legacy data import section - appears first when data is available */}
        {legacyDataStatus?.available && legacyDataStatus.projects && (
          <section className="settings-section legacy-data-section">
            <h3>Previous version data found</h3>
            {!oldVersionWarningDismissed && (
              <div className="settings-notice warning" role="alert">
                <span>If you still have the previous version of Protab installed, please remove it to avoid conflicts. Both versions share the same storage.</span>
                <button onClick={() => setOldVersionWarningDismissed(true)}>Dismiss</button>
              </div>
            )}
            <p className="settings-section-desc">
              Protab found data from a previous version (schema v{legacyDataStatus.schemaVersion}).
              Select which projects to import into your current workspace.
            </p>
            <div className="legacy-project-list">
              <div className="legacy-project-row legacy-project-header">
                <label className="legacy-project-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedLegacyProjects.size === legacyDataStatus.projects.length}
                    onChange={toggleAllLegacyProjects}
                  />
                  <span>Select all ({legacyDataStatus.projects.length} projects)</span>
                </label>
              </div>
              {legacyDataStatus.projects.map((project) => (
                <label key={project.name} className="legacy-project-row">
                  <input
                    type="checkbox"
                    checked={selectedLegacyProjects.has(project.name)}
                    onChange={() => toggleLegacyProject(project.name)}
                  />
                  <div className="legacy-project-info">
                    <span className="legacy-project-name">{project.name}</span>
                    <span className="legacy-project-meta">
                      {project.urlCount} URL{project.urlCount !== 1 ? 's' : ''}
                      {project.archivedCount > 0 && `, ${project.archivedCount} archived`}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="legacy-project-actions">
              <button
                className="button primary"
                onClick={handleImportLegacy}
                disabled={selectedLegacyProjects.size === 0}
              >
                Import selected ({selectedLegacyProjects.size})
              </button>
              <button
                className="button secondary"
                onClick={onDismissLegacyData}
              >
                Dismiss
              </button>
            </div>
            {legacyImportResult && (
              <div className={`settings-notice ${legacyImportResult.success ? 'success' : 'error'}`} role="status">
                <span>
                  {legacyImportResult.success
                    ? `Successfully imported ${legacyImportResult.importedCount} project${legacyImportResult.importedCount !== 1 ? 's' : ''}.`
                    : `Import failed: ${legacyImportResult.error}`}
                </span>
                <button onClick={onDismissLegacyImportResult}>Dismiss</button>
              </div>
            )}
          </section>
        )}

        <section className="settings-section">
          <h3>Projects</h3>
          <p className="settings-section-desc">Display options for the project sidebar.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="show-tab-counts">Show tab counts</label>
              <p>Display the number of saved URLs next to each project name. <em>(3 + 2) means 3 active and 2 archived.</em></p>
            </div>
            <div className="setting-control">
              <button
                id="show-tab-counts"
                role="switch"
                aria-checked={settings.showTabCounts}
                className={`toggle ${settings.showTabCounts ? 'active' : ''}`}
                onClick={() => onSave({ showTabCounts: !settings.showTabCounts })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="show-sidebar-quotes">Show sidebar quotes</label>
              <p>Adds a little daily nugget of wisdom to your sidebar.</p>
            </div>
            <div className="setting-control">
              <button
                id="show-sidebar-quotes"
                role="switch"
                aria-checked={settings.showSidebarQuotes}
                className={`toggle ${settings.showSidebarQuotes ? 'active' : ''}`}
                onClick={() => onSave({ showSidebarQuotes: !settings.showSidebarQuotes })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="projects-pane-position">Projects pane position</label>
              <p>Move the project list to the side that works best for your flow.</p>
            </div>
            <div className="setting-control">
              <select
                id="projects-pane-position"
                value={settings.projectsPanePosition}
                onChange={(e) => onSave({ projectsPanePosition: e.target.value as ProjectsPanePosition })}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Focus Tracking</h3>
          <p className="settings-section-desc">Decide what 'focused' means for you. The colors in your Analytics calendar will adjust to match.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="focus-threshold-focused">Focused threshold</label>
              <p>If you're below this many tabs, you're in the zone and focused. Shows as the darkest on your streaks.</p>
            </div>
            <div className="setting-control">
              <input
                id="focus-threshold-focused"
                type="number"
                min={1}
                max={settings.focusThresholds.normal - 1}
                value={settings.focusThresholds.focused}
                onChange={(e) => onSave({ focusThresholds: { ...settings.focusThresholds, focused: Number(e.target.value) } })}
                className="settings-number-input"
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="focus-threshold-normal">Normal threshold</label>
              <p>You're drifting out of focus and hogging up your memory and CPU resources if you cross this many tabs. Lighter on streak page.</p>
            </div>
            <div className="setting-control">
              <input
                id="focus-threshold-normal"
                type="number"
                min={settings.focusThresholds.focused + 1}
                max={settings.focusThresholds.distracted - 1}
                value={settings.focusThresholds.normal}
                onChange={(e) => onSave({ focusThresholds: { ...settings.focusThresholds, normal: Number(e.target.value) } })}
                className="settings-number-input"
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="focus-threshold-distracted">Distracted threshold</label>
              <p>Past this many tabs? You gotta get yourself together! Your brain works best when focused — neuroscience backs this up. Shows as the lightest shade on your streak. Stash away those distractions!</p>
            </div>
            <div className="setting-control">
              <input
                id="focus-threshold-distracted"
                type="number"
                min={settings.focusThresholds.normal + 1}
                max={100}
                value={settings.focusThresholds.distracted}
                onChange={(e) => onSave({ focusThresholds: { ...settings.focusThresholds, distracted: Number(e.target.value) } })}
                className="settings-number-input"
              />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Workspace Page</h3>
          <p className="settings-section-desc">What happens when you save a tab to a project.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="page-close-behavior">Close tab after filing</label>
              <p>Automatically close a tab once you've saved it to a project. Keeps things tidy.</p>
            </div>
            <div className="setting-control">
              <button
                id="page-close-behavior"
                role="switch"
                aria-checked={settings.pageCloseBehavior}
                className={`toggle ${settings.pageCloseBehavior ? 'active' : ''}`}
                onClick={() => onSave({ pageCloseBehavior: !settings.pageCloseBehavior })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Quick-capture popup</h3>
          <p className="settings-section-desc">What happens when you capture a tab from the popup.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="popup-close-behavior">Close tab after capture</label>
              <p>Automatically close the tab after saving. Off by default so you can keep reading.</p>
            </div>
            <div className="setting-control">
              <button
                id="popup-close-behavior"
                role="switch"
                aria-checked={settings.popupCloseBehavior}
                className={`toggle ${settings.popupCloseBehavior ? 'active' : ''}`}
                onClick={() => onSave({ popupCloseBehavior: !settings.popupCloseBehavior })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="popup-workspace-shortcut">Open workspace shortcut</label>
              <p>Jump straight to the full workspace from the popup with a keystroke.</p>
            </div>
            <div className="setting-control">
              <select
                id="popup-workspace-shortcut"
                value={settings.popupWorkspaceShortcut}
                onChange={(e) => onSave({ popupWorkspaceShortcut: e.target.value as ProtabSettings['popupWorkspaceShortcut'] })}
              >
                {WORKSPACE_SHORTCUTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="allow-quick-capture-create-project">Allow creating new projects</label>
              <p>If turned on, you can create a new project from the quick capture popup just like a new tag. (Recommended to keep disabled so that you can be mindful about too many projects)</p>
            </div>
            <div className="setting-control">
              <button
                id="allow-quick-capture-create-project"
                role="switch"
                aria-checked={settings.allowQuickCaptureCreateProject}
                className={`toggle ${settings.allowQuickCaptureCreateProject ? 'active' : ''}`}
                onClick={() => onSave({ allowQuickCaptureCreateProject: !settings.allowQuickCaptureCreateProject })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>General</h3>
          <div className="setting-row">
            <div className="setting-info">
              <label>Quick-capture shortcut</label>
              <p>
                <code>Ctrl+Shift+X</code> / <code>⌘+Shift+X</code>. Change it in Chrome's shortcut settings.
              </p>
            </div>
            <div className="setting-control">
              <button
                className="settings-link"
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              >
                Change <ExternalLink size={14} />
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="toast-duration">Toast duration</label>
              <p>Set how quickly confirmation messages disappear. Pick 'Manual dismiss' to close them yourself.</p>
            </div>
            <div className="setting-control toast-test-control">
              <select
                id="toast-duration"
                value={settings.toastDuration}
                onChange={(e) => onSave({ toastDuration: Number(e.target.value) })}
              >
                <option value={2000}>2 seconds</option>
                <option value={3000}>3 seconds</option>
                <option value={5000}>5 seconds</option>
                <option value={0}>Manual dismiss</option>
              </select>
              <button
                className="small-button"
                onClick={() => {
                  setShowTestToast(false)
                  setTestToastKey((k) => k + 1)
                  requestAnimationFrame(() => setShowTestToast(true))
                }}
              >
                Test
              </button>
              {showTestToast && (
                <div
                  key={testToastKey}
                  className="test-toast"
                  style={{ animationDuration: settings.toastDuration === 0 ? '0ms' : `${settings.toastDuration}ms` }}
                  onAnimationEnd={() => settings.toastDuration !== 0 && setShowTestToast(false)}
                >
                  <span>This is a test notification.</span>
                  <button onClick={() => setShowTestToast(false)}>×</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Backup &amp; restore</h3>
          {migrationBackupStatus?.available ? (
            <>
              <p className="settings-section-desc">
                A migration backup was created when Protab updated your saved data format
                (schema v{migrationBackupStatus.fromSchemaVersion} → v{migrationBackupStatus.toSchemaVersion}
                {migrationBackupStatus.createdAt
                  ? ` on ${new Date(migrationBackupStatus.createdAt).toLocaleDateString()}`
                  : ''}
                ).
              </p>
              <div className="setting-row">
                <div className="setting-info">
                  <label>Export migration backup</label>
                  <p>Save a copy of your old data before the update, just in case.</p>
                </div>
                <div className="setting-control">
                  <button className="small-button" onClick={handleExportBackup}>
                    <Download size={14} /> Export
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  <label>Restore migration backup</label>
                  <p>Restore your data to how it was before the update. This can't be undone — export a backup first if you're unsure.</p>
                </div>
                <div className="setting-control">
                  <button className="small-button" onClick={handleRestoreClick}>
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="settings-section-desc settings-section-empty">All good! No previous version data to restore.</p>
          )}
          {migrationRestoreResult && (
            <div className={`settings-notice ${migrationRestoreResult.success ? 'success' : 'error'}`} role="status">
              <span>
                {migrationRestoreResult.success
                  ? 'Migration backup restored successfully.'
                  : `Restore failed: ${migrationRestoreResult.error}`}
              </span>
              <button onClick={onDismissRestoreResult}>Dismiss</button>
            </div>
          )}
        </section>
      </div>

      {confirmRestore && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="restore-confirm-title">
            <div className="dialog-header">
              <h2 id="restore-confirm-title">Restore migration backup?</h2>
            </div>
            <div className="dialog-body">
              <p>
                This will replace your current project data with the backed-up state
                from before Protab updated your data format
                {migrationBackupStatus?.fromSchemaVersion !== undefined
                  ? ` (schema v${migrationBackupStatus.fromSchemaVersion} → v${migrationBackupStatus.toSchemaVersion})`
                  : ''}
                .
              </p>
              <p style={{ marginTop: 8 }}>
                Your current projects and saved URLs will be replaced. This action cannot be undone.
              </p>
            </div>
            <div className="dialog-actions">
              <button className="button secondary" onClick={handleCancelRestore}>Cancel</button>
              <button className="button danger" onClick={handleConfirmRestore}>Restore backup</button>
            </div>
          </section>
        </div>
      )}

      {confirmImport && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title">
            <div className="dialog-header">
              <h2 id="import-confirm-title">Import previous version data?</h2>
            </div>
            <div className="dialog-body">
              <p>
                This will import {selectedLegacyProjects.size} project{selectedLegacyProjects.size !== 1 ? 's' : ''} from your previous Protab version into the current workspace.
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                {Array.from(selectedLegacyProjects).map((name) => {
                  const project = legacyDataStatus?.projects?.find((p) => p.name === name)
                  return (
                    <li key={name}>
                      {name} — {project?.urlCount ?? 0} URL{(project?.urlCount ?? 0) !== 1 ? 's' : ''}
                      {(project?.archivedCount ?? 0) > 0 ? ` (${project?.archivedCount} archived)` : ''}
                    </li>
                  )
                })}
              </ul>
              <p style={{ marginTop: 8 }}>
                Projects with the same name as existing projects will be skipped.
              </p>
            </div>
            <div className="dialog-actions">
              <button className="button secondary" onClick={handleCancelImport}>Cancel</button>
              <button className="button primary" onClick={handleConfirmImport}>Import</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
