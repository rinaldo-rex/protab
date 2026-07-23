import { ArrowLeft, BarChart3, Folder, Link, Archive, TrendingDown } from 'lucide-react'
import type { ProtabAnalytics, FocusThresholds } from '../domain/analytics'
import { FocusHeatmap } from './FocusHeatmap'

interface AnalyticsPanelProps {
  analytics: ProtabAnalytics
  projectCount: number
  totalSavedUrls: number
  focusThresholds: FocusThresholds
  onBack: () => void
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

function actionLabel(type: string): string {
  switch (type) {
    case 'file': return 'Tab filed'
    case 'bulk-file': return 'Bulk filed'
    case 'activate': return 'Project activated'
    case 'close-all': return 'All closed'
    default: return type
  }
}

export function AnalyticsPanel({ analytics, projectCount, totalSavedUrls, focusThresholds, onBack }: AnalyticsPanelProps) {
  const lastActionReduction = analytics.lastAction
    ? analytics.lastAction.tabsBefore - analytics.lastAction.tabsAfter
    : 0
  const lastActionPercent = analytics.lastAction && analytics.lastAction.tabsBefore > 0
    ? Math.round((lastActionReduction / analytics.lastAction.tabsBefore) * 100)
    : 0

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to workspace">
          <ArrowLeft size={18} />
        </button>
        <BarChart3 size={18} />
        <h2>Analytics</h2>
      </div>

      <div className="analytics-content">
        {/* Focus heatmap */}
        <section className="analytics-section">
          <h3>Focus over time</h3>
          <p className="analytics-section-desc">Days with fewer open tabs are darker. Configured thresholds: {focusThresholds.focused}/{focusThresholds.normal}/{focusThresholds.distracted} tabs.</p>
          <FocusHeatmap dailyFocus={analytics.dailyFocus} thresholds={focusThresholds} />
        </section>

        {/* Lifetime stats */}
        <section className="analytics-section">
          <h3>Lifetime</h3>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-icon"><Link size={20} /></div>
              <div className="stat-value">{totalSavedUrls}</div>
              <div className="stat-label">URLs organized</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Folder size={20} /></div>
              <div className="stat-value">{projectCount}</div>
              <div className="stat-label">Projects</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><TrendingDown size={20} /></div>
              <div className="stat-value">{analytics.totalTabsFiled}</div>
              <div className="stat-label">Tabs filed</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Archive size={20} /></div>
              <div className="stat-value">{analytics.totalUrlsArchived}</div>
              <div className="stat-label">URLs archived</div>
            </div>
          </div>
        </section>

        {/* Last action */}
        {analytics.lastAction && (
          <section className="analytics-section">
            <h3>Last action</h3>
            <div className="last-action-card">
              <div className="last-action-header">
                <span className="last-action-type">{actionLabel(analytics.lastAction.type)}</span>
                <span className="last-action-time">{formatTimestamp(analytics.lastAction.timestamp)}</span>
              </div>
              <div className="last-action-stat">
                <span className="last-action-before">{analytics.lastAction.tabsBefore} tabs</span>
                <span className="last-action-arrow">→</span>
                <span className="last-action-after">{analytics.lastAction.tabsAfter} tabs</span>
                <span className="last-action-reduction">
                  −{lastActionReduction} ({lastActionPercent}%)
                </span>
              </div>
            </div>
          </section>
        )}

        {!analytics.lastAction && (
          <section className="analytics-section">
            <div className="analytics-empty">
              <BarChart3 size={32} />
              <p>No actions recorded yet</p>
              <small>File tabs or activate projects to see your impact here.</small>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
