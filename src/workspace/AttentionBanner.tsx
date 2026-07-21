import { useState } from 'react'
import { AlertTriangle, ChevronDown, ExternalLink, RefreshCw, X } from 'lucide-react'
import type { CloseAttempt } from '../background/tabs/closeTracker'

interface AttentionBannerProps {
  items: CloseAttempt[]
  onFocusTab: (tabId: number) => void
  onRetryClose: (operationId: string) => void
  onDismissItem: (operationId: string) => void
  onDismissBanner: () => void
}

export function AttentionBanner({ items, onFocusTab, onRetryClose, onDismissItem, onDismissBanner }: AttentionBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="attention-banner" role="alert">
      <div className="attention-banner-header">
        <AlertTriangle size={18} aria-hidden="true" />
        <span className="attention-banner-title">
          {items.length} tab{items.length !== 1 ? 's' : ''} need{items.length === 1 ? 's' : ''} attention
        </span>
        <button
          className="attention-expand-button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          <ChevronDown size={16} className={expanded ? 'expanded' : ''} />
        </button>
        <button
          className="icon-button"
          aria-label="Dismiss banner"
          onClick={onDismissBanner}
        >
          <X size={16} />
        </button>
      </div>

      {expanded && (
        <ul className="attention-item-list">
          {items.map((item) => (
            <li key={item.operationId} className="attention-item">
              <div className="attention-item-content">
                <span className="attention-item-title">
                  Tab {item.tabId}
                </span>
                <span className="attention-item-reason">
                  {item.state === 'failed' && 'Close failed'}
                  {item.state === 'surviving' && 'Still open'}
                  {item.error && ` — ${item.error}`}
                </span>
              </div>
              <div className="attention-item-actions">
                <button
                  className="small-button"
                  onClick={() => onFocusTab(item.tabId)}
                  aria-label={`Focus tab ${item.tabId}`}
                >
                  <ExternalLink size={12} /> Focus
                </button>
                {(item.state === 'failed' || item.state === 'surviving') && (
                  <button
                    className="small-button"
                    onClick={() => onRetryClose(item.operationId)}
                    aria-label={`Retry close for tab ${item.tabId}`}
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                )}
                <button
                  className="small-button"
                  onClick={() => onDismissItem(item.operationId)}
                  aria-label={`Dismiss tab ${item.tabId}`}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
