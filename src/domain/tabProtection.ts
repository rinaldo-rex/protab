export type ProtectionReason = 'manual-pin' | 'chrome-pinned' | 'audible'

export const PROTECTION_LABELS: Record<ProtectionReason, string> = {
  'manual-pin': 'Pinned',
  'chrome-pinned': 'Chrome pinned',
  'audible': 'Playing audio',
}

export function computeProtectionReasons(
  chromePinned: boolean,
  chromeAudible: boolean,
  manualPinnedTabIds: ReadonlySet<number>,
  tabId: number,
): ProtectionReason[] {
  const reasons: ProtectionReason[] = []
  if (manualPinnedTabIds.has(tabId)) reasons.push('manual-pin')
  if (chromePinned) reasons.push('chrome-pinned')
  if (chromeAudible) reasons.push('audible')
  return reasons
}

export function isProtected(reasons: ProtectionReason[]): boolean {
  return reasons.length > 0
}

export function formatProtectionLabel(reasons: ProtectionReason[]): string {
  if (reasons.length === 0) return ''
  return reasons.map((r) => PROTECTION_LABELS[r]).join(', ')
}
