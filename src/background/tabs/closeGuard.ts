import type { ProtectionReason } from '../../domain/tabProtection'
import type { ChromeTabsApi } from './chromeTabs'
import type { ProtectedTabsStore } from './protectedTabsStore'

export interface CloseProtectionDecision {
  protected: boolean
  reasons: ProtectionReason[]
}

export async function checkCloseProtection(
  tabId: number,
  api: ChromeTabsApi,
  protectedStore: ProtectedTabsStore,
): Promise<CloseProtectionDecision> {
  // Re-read current tab state from Chrome
  const tab = await api.get(tabId).catch(() => null)
  if (!tab) {
    // Tab disappeared — not our concern here, caller handles
    return { protected: false, reasons: [] }
  }

  const manualPinned = await protectedStore.read()
  const reasons: ProtectionReason[] = []

  if (manualPinned.has(tabId)) reasons.push('manual-pin')
  if (tab.pinned) reasons.push('chrome-pinned')
  if (tab.audible) reasons.push('audible')

  return { protected: reasons.length > 0, reasons }
}
