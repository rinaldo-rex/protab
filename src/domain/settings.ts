export type WorkspaceShortcut = 'ctrl+enter' | 'ctrl+shift+enter' | 'alt+enter'
export type ProjectsPanePosition = 'left' | 'right'

export const WORKSPACE_SHORTCUTS: { value: WorkspaceShortcut; label: string }[] = [
  { value: 'ctrl+enter', label: 'Ctrl+Enter' },
  { value: 'ctrl+shift+enter', label: 'Ctrl+Shift+Enter' },
  { value: 'alt+enter', label: 'Alt+Enter' },
]

export interface ProtabSettings {
  schemaVersion: 1
  pageCloseBehavior: boolean // Workspace page: close tab after filing (default: true)
  popupCloseBehavior: boolean // Extension popup: close tab after capture (default: false)
  popupWorkspaceShortcut: WorkspaceShortcut // Shortcut to open workspace from popup (default: 'ctrl+enter')
  toastDuration: number // milliseconds: 2000, 3000, 5000, or 0 (manual)
  showTabCounts: boolean // Show tab counts next to project names (default: true)
  projectsPanePosition: ProjectsPanePosition // Where the projects pane appears (default: 'right')
}

export const SETTINGS_STORAGE_KEY = 'protab.settings.v1'

export const DEFAULT_SETTINGS: ProtabSettings = {
  schemaVersion: 1,
  pageCloseBehavior: true,
  popupCloseBehavior: false,
  popupWorkspaceShortcut: 'ctrl+enter',
  toastDuration: 3000,
  showTabCounts: true,
  projectsPanePosition: 'right',
}

export function parseSettings(raw: unknown): ProtabSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const obj = raw as Record<string, unknown>

  const validShortcuts: WorkspaceShortcut[] = ['ctrl+enter', 'ctrl+shift+enter', 'alt+enter']
  const rawShortcut = obj.popupWorkspaceShortcut

  return {
    schemaVersion: 1,
    pageCloseBehavior: typeof obj.pageCloseBehavior === 'boolean' ? obj.pageCloseBehavior : DEFAULT_SETTINGS.pageCloseBehavior,
    popupCloseBehavior: typeof obj.popupCloseBehavior === 'boolean' ? obj.popupCloseBehavior : DEFAULT_SETTINGS.popupCloseBehavior,
    popupWorkspaceShortcut: typeof rawShortcut === 'string' && validShortcuts.includes(rawShortcut as WorkspaceShortcut)
      ? rawShortcut as WorkspaceShortcut
      : DEFAULT_SETTINGS.popupWorkspaceShortcut,
    toastDuration: typeof obj.toastDuration === 'number' && [2000, 3000, 5000, 0].includes(obj.toastDuration)
      ? obj.toastDuration
      : DEFAULT_SETTINGS.toastDuration,
    showTabCounts: typeof obj.showTabCounts === 'boolean' ? obj.showTabCounts : DEFAULT_SETTINGS.showTabCounts,
    projectsPanePosition: obj.projectsPanePosition === 'left' || obj.projectsPanePosition === 'right'
      ? obj.projectsPanePosition
      : DEFAULT_SETTINGS.projectsPanePosition,
  }
}

export async function readSettings(): Promise<ProtabSettings> {
  const values = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  return parseSettings(values[SETTINGS_STORAGE_KEY])
}

export async function writeSettings(settings: ProtabSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
}
