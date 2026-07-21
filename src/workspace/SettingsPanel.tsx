import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { ProtabSettings } from '../domain/settings'
import { WORKSPACE_SHORTCUTS } from '../domain/settings'

interface SettingsPanelProps {
  settings: ProtabSettings
  onSave: (settings: Partial<ProtabSettings>) => void
  onBack: () => void
}

export function SettingsPanel({ settings, onSave, onBack }: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to workspace">
          <ArrowLeft size={18} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="settings-sections">
        <section className="settings-section">
          <h3>Extension Page</h3>
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
      </div>
    </div>
  )
}
