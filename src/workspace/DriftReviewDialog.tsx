import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { PreparedActivationOperation } from '../background/messages'

interface DriftTabReview {
  tabId: number
  savedUrl: string
  currentUrl: string
  keep: boolean
}

interface DriftReviewDialogProps {
  operation: PreparedActivationOperation
  pending: boolean
  onConfirm: (operationId: string, keptTabIds: number[]) => void
  onCancel: (operationId: string) => void
}

export function DriftReviewDialog({ operation, pending, onConfirm, onCancel }: DriftReviewDialogProps) {
  const [reviews, setReviews] = useState<DriftTabReview[]>(
    operation.driftedTabs.map((tab) => ({ ...tab, keep: false }))
  )

  const toggleKeep = (tabId: number) => {
    setReviews((prev) =>
      prev.map((review) =>
        review.tabId === tabId ? { ...review, keep: !review.keep } : review
      )
    )
  }

  const keptTabIds = reviews.filter((r) => r.keep).map((r) => r.tabId)
  const closingCount = reviews.length - keptTabIds.length

  return (
    <div className="filing-dialog-backdrop" role="presentation">
      <section
        className="filing-dialog drift-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drift-review-title"
      >
        <div className="filing-dialog-header">
          <h3 id="drift-review-title">Review navigated tabs</h3>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => onCancel(operation.operationId)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="filing-dialog-body">
          <p className="drift-review-intro">
            {operation.driftedTabs.length} tab{operation.driftedTabs.length !== 1 ? 's' : ''} owned
            by other projects {operation.driftedTabs.length !== 1 ? 'have' : 'has'} navigated away from
            their saved URL. Choose which to keep open.
          </p>

          <ul className="drift-review-list">
            {reviews.map((review) => (
              <li key={review.tabId} className={`drift-review-item ${review.keep ? 'kept' : ''}`}>
                <div className="drift-review-urls">
                  <div className="drift-url-original">
                    <span className="drift-url-label">Saved URL</span>
                    <span className="drift-url-value">{review.savedUrl}</span>
                  </div>
                  <div className="drift-url-current">
                    <span className="drift-url-label">Current URL</span>
                    <span className="drift-url-value">{review.currentUrl}</span>
                  </div>
                </div>
                <button
                  className={`drift-keep-toggle ${review.keep ? 'kept' : ''}`}
                  onClick={() => toggleKeep(review.tabId)}
                  aria-pressed={review.keep}
                  aria-label={review.keep ? 'Keep this tab open' : 'Close this tab'}
                >
                  {review.keep ? 'Keep' : 'Close'}
                </button>
              </li>
            ))}
          </ul>

          {keptTabIds.length > 0 && (
            <p className="drift-kept-note">
              <AlertTriangle size={14} />
              Kept tabs will be marked for review in the Current Tabs pane.
            </p>
          )}
        </div>

        <div className="filing-dialog-actions">
          <button
            className="button secondary"
            onClick={() => onCancel(operation.operationId)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => onConfirm(operation.operationId, keptTabIds)}
            disabled={pending}
          >
            {pending ? 'Activating…' : `Close ${closingCount} tab${closingCount !== 1 ? 's' : ''} and activate`}
          </button>
        </div>
      </section>
    </div>
  )
}
