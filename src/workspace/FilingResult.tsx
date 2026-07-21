import { AlertTriangle, Check, RefreshCw, X } from 'lucide-react'
import type { FilingResult as FilingResultType } from '../background/tabs/filing'

interface FilingResultProps {
  result: FilingResultType
  onRetry?: (operationId: string) => void
  onDismiss: () => void
}

export function FilingResult({ result, onRetry, onDismiss }: FilingResultProps) {
  const isError = result.closeState === 'failed' || result.closeState === 'skipped'
  const isSurviving = result.closeState === 'requested' && result.error
  const retryable = result.closeState === 'failed' && onRetry

  return (
    <div
      className={`filing-result ${isError || isSurviving ? 'filing-result-error' : 'filing-result-success'}`}
      role={isError || isSurviving ? 'alert' : 'status'}
    >
      <div className="filing-result-icon">
        {isError || isSurviving ? (
          <AlertTriangle size={16} aria-hidden="true" />
        ) : (
          <Check size={16} aria-hidden="true" />
        )}
      </div>

      <div className="filing-result-content">
        {result.filing === 'created' && result.closeState === 'requested' && !result.error && (
          <span>URL saved. Tab close requested.</span>
        )}
        {result.filing === 'reused' && result.closeState === 'requested' && !result.error && (
          <span>URL already saved. Tab close requested.</span>
        )}
        {result.closeState === 'closed' && (
          <span>URL saved. Tab closed.</span>
        )}
        {result.closeState === 'skipped' && result.error?.includes('URL changed') && (
          <span>URL changed — not closed. File again if needed.</span>
        )}
        {result.closeState === 'skipped' && !result.error?.includes('URL changed') && (
          <span>{result.error ?? 'Tab was not filed.'}</span>
        )}
        {result.closeState === 'failed' && (
          <span>{result.error ?? 'Filing failed.'}</span>
        )}
        {isSurviving && (
          <span>Tab saved but still open. {result.error}</span>
        )}
      </div>

      <div className="filing-result-actions">
        {retryable && (
          <button
            className="small-button"
            onClick={() => onRetry(result.operationId)}
            aria-label="Retry close"
          >
            <RefreshCw size={14} /> Retry
          </button>
        )}
        <button
          className="icon-button"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
