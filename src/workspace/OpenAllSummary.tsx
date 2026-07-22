import { CheckCircle, AlertTriangle, X, FolderOpen } from 'lucide-react'
import type { OpenAllSummary as OpenAllSummaryType } from '../background/messages'

interface OpenAllSummaryProps {
  summary: OpenAllSummaryType
  projectName: string
  onDismiss: () => void
}

export function OpenAllSummary({ summary, projectName, onDismiss }: OpenAllSummaryProps) {
  const hasFailures = summary.failed.length > 0
  const successCount = summary.focused + summary.created

  return (
    <div className="filing-summary">
      <div className="filing-summary-header">
        {hasFailures ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
        <h3>Open all complete</h3>
        <button className="icon-button" aria-label="Close" onClick={onDismiss}>
          <X size={18} />
        </button>
      </div>

      <div className="filing-summary-body">
        <p className="filing-summary-target">
          Opened URLs from <strong>{projectName}</strong>
        </p>

        <div className="filing-summary-counts">
          {summary.focused > 0 && (
            <div className="filing-count">
              <FolderOpen size={14} />
              <span>{summary.focused} existing tab{summary.focused !== 1 ? 's' : ''} focused</span>
            </div>
          )}
          {summary.created > 0 && (
            <div className="filing-count">
              <CheckCircle size={14} />
              <span>{summary.created} new tab{summary.created !== 1 ? 's' : ''} created</span>
            </div>
          )}
        </div>

        {hasFailures && (
          <div className="filing-summary-issues">
            <div className="filing-issue">
              <AlertTriangle size={14} />
              <div>
                <strong>Failed ({summary.failed.length})</strong>
                <ul className="filing-issue-list">
                  {summary.failed.map((item, index) => (
                    <li key={index}>{item.savedUrlId}: {item.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {!hasFailures && successCount === summary.total && (
          <p className="filing-summary-success">
            All {summary.total} URL{summary.total !== 1 ? 's' : ''} opened successfully.
          </p>
        )}
      </div>

      <div className="filing-dialog-actions">
        <button className="button primary" onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  )
}
