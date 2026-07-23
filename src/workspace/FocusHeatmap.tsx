import { useMemo } from 'react'
import type { DailyFocusEntry, FocusThresholds } from '../domain/analytics'
import { getFocusLevel } from '../domain/analytics'

interface FocusHeatmapProps {
  dailyFocus: Record<string, DailyFocusEntry>
  thresholds: FocusThresholds
}

// Warm tones matching the extension's aesthetic
const FOCUS_COLORS = [
  'var(--surface-container)',  // Level 0: no data or very distracted
  '#e8d5c4',                   // Level 1: lightest warm
  '#d4a574',                   // Level 2: light warm
  '#b07a3f',                   // Level 3: medium warm
  '#8b5e2f',                   // Level 4: darkest warm (most focused)
]

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getWeeksToShow(): Date[][] {
  const weeks: Date[][] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Go back 52 weeks
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (52 * 7 + today.getDay()))

  // Build weeks
  const current = new Date(startDate)
  while (current <= today) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      if (current <= today) {
        week.push(new Date(current))
      }
      current.setDate(current.getDate() + 1)
    }
    if (week.length > 0) {
      weeks.push(week)
    }
  }

  return weeks
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTooltip(date: Date, entry: DailyFocusEntry | undefined, thresholds: FocusThresholds): string {
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (!entry) return `${dateStr}: No data`
  const level = getFocusLevel(entry.avgTabCount, thresholds)
  const labels = ['Very distracted', 'Distracted', 'Normal', 'Focused', 'Very focused']
  return `${dateStr}: ${entry.avgTabCount} avg tabs — ${labels[level]}`
}

export function FocusHeatmap({ dailyFocus, thresholds }: FocusHeatmapProps) {
  const weeks = useMemo(() => getWeeksToShow(), [])

  // Build month label spans — each span covers the weeks belonging to that month
  const monthSpans = useMemo(() => {
    const spans: { label: string; width: number }[] = []
    let lastMonth = -1
    let count = 0

    weeks.forEach((week) => {
      const month = week[0].getMonth()
      if (month !== lastMonth) {
        if (count > 0) {
          spans.push({ label: MONTH_LABELS[lastMonth], width: count })
        }
        lastMonth = month
        count = 1
      } else {
        count++
      }
    })
    if (count > 0 && lastMonth >= 0) {
      spans.push({ label: MONTH_LABELS[lastMonth], width: count })
    }

    return spans
  }, [weeks])

  const cellSize = 12
  const cellGap = 3

  return (
    <div className="focus-heatmap">
      <div className="heatmap-month-labels">
        {monthSpans.map((span, i) => (
          <span
            key={i}
            className="heatmap-month-label"
            style={{ width: span.width * (cellSize + cellGap) - cellGap }}
          >
            {span.label}
          </span>
        ))}
      </div>
      <div className="heatmap-grid-wrapper">
        <div className="heatmap-day-labels">
          {DAY_LABELS.map((label, i) => (
            <span key={i} className="heatmap-day-label">{label}</span>
          ))}
        </div>
        <div className="heatmap-grid">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="heatmap-week">
              {week.map((date) => {
                const key = dateKey(date)
                const entry = dailyFocus[key]
                const level = entry ? getFocusLevel(entry.avgTabCount, thresholds) : 0
                return (
                  <div
                    key={key}
                    className="heatmap-cell"
                    style={{ backgroundColor: entry ? FOCUS_COLORS[level] : FOCUS_COLORS[0] }}
                    title={formatTooltip(date, entry, thresholds)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Distracted</span>
        {FOCUS_COLORS.map((color, i) => (
          <div key={i} className="heatmap-legend-cell" style={{ backgroundColor: color }} />
        ))}
        <span className="heatmap-legend-label">Focused</span>
      </div>
    </div>
  )
}
