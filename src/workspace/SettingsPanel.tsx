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
              <p>Display the number of saved URLs next to each project name.</p>
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
              <label htmlFor="projects-pane-position">Projects pane position</label>
              <p>Choose which side of the workspace the projects list appears on.</p>
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
          <p className="settings-section-desc">Tab count thresholds for the focus heatmap in Analytics. Darker = fewer tabs = more focused.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="focus-threshold-focused">Focused threshold</label>
              <p>0 to this count = darkest green (most focused).</p>
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
              <p>Focused+1 to this count = medium green.</p>
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
              <p>Normal+1 to this count = lightest green. Above this = no color.</p>
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
          <p className="settings-section-desc">Behavior when filing tabs from the Current Tabs pane.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="page-close-behavior">Close tab after filing</label>
              <p>When pressing 'A' to file a tab, close the tab after saving.</p>
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
          <h3>Extension Popup</h3>
          <p className="settings-section-desc">Behavior when using the quick-capture popup.</p>
          <div className="setting-row">
            <div className="setting-info">
              <label htmlFor="popup-close-behavior">Close tab after capture</label>
              <p>When using quick-capture, close the tab after saving. Default keeps the tab open.</p>
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
              <p>Keyboard shortcut to open the full workspace from the popup.</p>
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
        </section>

        <section className="settings-section">
          <h3>General</h3>
          <div className="setting-row">
            <div className="setting-info">
              <label>Quick-capture shortcut</label>
              <p>
                <code>Ctrl+Shift+X</code> (or <code>Cmd+Shift+X</code> on Mac)
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
              <p>How long success/error toasts stay visible.</p>
            </div>
            <div className="setting-control">
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
            </div>
          </div>
        </section>

        {migrationBackupStatus?.available && (
          <section className="settings-section">
            <h3>Data Recovery</h3>
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
                <p>Download the pre-migration data as JSON for manual safekeeping.</p>
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
                <p>Replace current project data with the backed-up state. This cannot be undone.</p>
              </div>
              <div className="setting-control">
                <button className="small-button" onClick={handleRestoreClick}>
                  <RotateCcw size={14} /> Restore
                </button>
              </div>
            </div>
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
        )}
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
