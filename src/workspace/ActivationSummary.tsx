import { AlertTriangle, CheckCircle, X, RefreshCw } from 'lucide-react'
import type { ActivationSummary as ActivationSummaryType } from '../background/messages'

interface ActivationSummaryProps {
  summary: ActivationSummaryType
  projectName: string
  onDismiss: () => void
  onRetryFailed?: () => void
}

export function ActivationSummary({ summary, projectName, onDismiss, onRetryFailed }: ActivationSummaryProps) {
  const hasIssues = summary.skipped.length > 0 || summary.failed.length > 0
  const successCount = summary.closed + summary.requested

  return (
    <div className="filing-summary">
      <div className="filing-summary-header">
        {hasIssues ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
        <h3>Activation complete</h3>
        <button className="icon-button" aria-label="Close" onClick={onDismiss}>
          <X size={18} />
        </button>
      </div>

      <div className="filing-summary-body">
        <p className="filing-summary-target">
          <strong>{projectName}</strong> is now active in this window.
        </p>

        <div className="filing-summary-counts">
          {successCount > 0 && (
            <div className="filing-count">
              <CheckCircle size={14} />
              <span>{successCount} other-project tab{successCount !== 1 ? 's' : ''} closed</span>
            </div>
          )}
          {summary.kept > 0 && (
            <div className="filing-count kept">
              <AlertTriangle size={14} />
              <span>{summary.kept} tab{summary.kept !== 1 ? 's' : ''} kept open</span>
            </div>
          )}
          {summary.unassignedCount > 0 && (
            <div className="filing-count unassigned">
              <span>{summary.unassignedCount} unassigned tab{summary.unassignedCount !== 1 ? 's' : ''} remain open</span>
            </div>
          )}
        </div>

        {hasIssues && (
          <div className="filing-summary-issues">
            {summary.skipped.length > 0 && (
              <div className="filing-issue">
                <AlertTriangle size={14} />
                <div>
                  <strong>Skipped ({summary.skipped.length})</strong>
                  <ul className="filing-issue-list">
                    {summary.skipped.map((item, index) => (
                      <li key={index}>Tab {item.tabId}: {item.reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {summary.failed.length > 0 && (
              <div className="filing-issue">
                <AlertTriangle size={14} />
                <div>
                  <strong>Failed ({summary.failed.length})</strong>
                  <ul className="filing-issue-list">
                    {summary.failed.map((item, index) => (
                      <li key={index}>Tab {item.tabId}: {item.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasIssues && (
          <p className="filing-summary-success">
            All other-project tabs closed successfully.
          </p>
        )}
      </div>

      <div className="filing-dialog-actions">
        {hasIssues && onRetryFailed && summary.failed.length > 0 && (
          <button className="button secondary" onClick={onRetryFailed}>
            <RefreshCw size={14} /> Retry failed
          </button>
        )}
        <button className="button primary" onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  )
}
