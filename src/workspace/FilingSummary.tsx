import { AlertTriangle, Check, FolderInput, RefreshCw, X } from 'lucide-react'
import type { FilingSummary as FilingSummaryType } from '../background/tabs/filing'

interface FilingSummaryProps {
  summary: FilingSummaryType
  projectName: string
  onRetryClose?: (operationId: string) => void
  onDismiss: () => void
}

export function FilingSummary({ summary, projectName, onRetryClose, onDismiss }: FilingSummaryProps) {
  const hasIssues = summary.skipped.length > 0 || summary.failed.length > 0 || summary.surviving > 0

  return (
    <div className="filing-summary" role="status">
      <div className="filing-summary-header">
        <FolderInput size={18} aria-hidden="true" />
        <h3>Bulk filing complete</h3>
        <button className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
          <X size={18} />
        </button>
      </div>

      <div className="filing-summary-body">
        <p className="filing-summary-target">
          Filed to <strong>{projectName}</strong>
        </p>

        <div className="filing-summary-counts">
          {summary.created > 0 && (
            <div className="filing-count">
              <Check size={14} aria-hidden="true" />
              <span>{summary.created} new URL{summary.created !== 1 ? 's' : ''} saved</span>
            </div>
          )}
          {summary.reused > 0 && (
            <div className="filing-count">
              <Check size={14} aria-hidden="true" />
              <span>{summary.reused} existing URL{summary.reused !== 1 ? 's' : ''} reused</span>
            </div>
          )}
          {summary.closeRequested > 0 && (
            <div className="filing-count">
              <Check size={14} aria-hidden="true" />
              <span>{summary.closeRequested} tab{summary.closeRequested !== 1 ? 's' : ''} close requested</span>
            </div>
          )}
          {summary.alreadyClosed > 0 && (
            <div className="filing-count">
              <Check size={14} aria-hidden="true" />
              <span>{summary.alreadyClosed} tab{summary.alreadyClosed !== 1 ? 's' : ''} already closed</span>
            </div>
          )}
        </div>

        {hasIssues && (
          <div className="filing-summary-issues">
            {summary.surviving > 0 && (
              <div className="filing-issue">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{summary.surviving} tab{summary.surviving !== 1 ? 's' : ''} still open (may show native warning)</span>
              </div>
            )}
            {summary.skipped.length > 0 && (
              <div className="filing-issue">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{summary.skipped.length} skipped</span>
                <ul className="filing-issue-list">
                  {summary.skipped.map((item, i) => (
                    <li key={i}>{item.reason === 'url-changed' ? 'URL changed' : item.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.failed.length > 0 && (
              <div className="filing-issue">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{summary.failed.length} failed</span>
                <ul className="filing-issue-list">
                  {summary.failed.map((item, i) => (
                    <li key={i}>
                      {item.message}
                      {onRetryClose && item.stage === 'close' && (
                        <button
                          className="small-button"
                          onClick={() => onRetryClose(`retry-${item.tabId}-${i}`)}
                        >
                          <RefreshCw size={12} /> Retry
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!hasIssues && (
          <p className="filing-summary-success">
            All eligible tabs filed successfully.
          </p>
        )}
      </div>
    </div>
  )
}
