export interface ProtabSettings {
  schemaVersion: 1
  pageCloseBehavior: boolean // Extension page: close tab after filing (default: true)
  popupCloseBehavior: boolean // Extension popup: close tab after capture (default: false)
  toastDuration: number // milliseconds: 2000, 3000, 5000, or 0 (manual)
}

export const SETTINGS_STORAGE_KEY = 'protab.settings.v1'

export const DEFAULT_SETTINGS: ProtabSettings = {
  schemaVersion: 1,
  pageCloseBehavior: true,
  popupCloseBehavior: false,
  toastDuration: 3000,
}

export function parseSettings(raw: unknown): ProtabSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }

  const obj = raw as Record<string, unknown>

  return {
    schemaVersion: 1,
    pageCloseBehavior: typeof obj.pageCloseBehavior === 'boolean' ? obj.pageCloseBehavior : DEFAULT_SETTINGS.pageCloseBehavior,
    popupCloseBehavior: typeof obj.popupCloseBehavior === 'boolean' ? obj.popupCloseBehavior : DEFAULT_SETTINGS.popupCloseBehavior,
    toastDuration: typeof obj.toastDuration === 'number' && [2000, 3000, 5000, 0].includes(obj.toastDuration)
      ? obj.toastDuration
      : DEFAULT_SETTINGS.toastDuration,
  }
}

export async function readSettings(): Promise<ProtabSettings> {
  const values = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  return parseSettings(values[SETTINGS_STORAGE_KEY])
}

export async function writeSettings(settings: ProtabSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
}
