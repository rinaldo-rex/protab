export interface DailyFocusEntry {
  samples: number[]
  avgTabCount: number
}

export interface ProtabAnalytics {
  totalTabsFiled: number
  totalUrlsArchived: number
  lastAction?: {
    type: 'file' | 'activate' | 'close-all' | 'bulk-file'
    tabsBefore: number
    tabsAfter: number
    timestamp: number
  }
  dailyFocus: Record<string, DailyFocusEntry>
}

export interface FocusThresholds {
  focused: number      // 0 to this = darkest green
  normal: number       // focused+1 to this = medium
  distracted: number   // normal+1 to this = lightest
  // above distracted = no color (very distracted)
}

export const DEFAULT_FOCUS_THRESHOLDS: FocusThresholds = {
  focused: 5,
  normal: 15,
  distracted: 30,
}

export const emptyAnalytics = (): ProtabAnalytics => ({
  totalTabsFiled: 0,
  totalUrlsArchived: 0,
  dailyFocus: {},
})

export function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function recordFocusSample(analytics: ProtabAnalytics, tabCount: number): ProtabAnalytics {
  const key = todayKey()
  const existing = analytics.dailyFocus[key]
  const samples = existing ? [...existing.samples, tabCount] : [tabCount]
  const avgTabCount = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
  return {
    ...analytics,
    dailyFocus: {
      ...analytics.dailyFocus,
      [key]: { samples, avgTabCount },
    },
  }
}

export function getFocusLevel(avgTabCount: number, thresholds: FocusThresholds): 0 | 1 | 2 | 3 | 4 {
  if (avgTabCount <= thresholds.focused) return 4      // Darkest = most focused
  if (avgTabCount <= thresholds.normal) return 3
  if (avgTabCount <= thresholds.distracted) return 2
  if (avgTabCount <= thresholds.distracted * 2) return 1
  return 0  // No color / very distracted
}
