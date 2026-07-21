import { useState } from 'react'
import { Folder, X } from 'lucide-react'
import type { PreparedFilingOperation } from '../background/tabs/filing'
import type { PersistedState } from '../domain/types'

interface FileTabsDialogProps {
  operation: PreparedFilingOperation
  state: PersistedState
  pending: boolean
  onConfirm: (operationId: string) => void
  onCancel: (operationId: string) => void
}

export function FileTabsDialog({ operation, state, pending, onConfirm, onCancel }: FileTabsDialogProps) {
  const [step, setStep] = useState<'preview' | 'confirm'>('preview')
  const project = state.projects.find((p) => p.id === operation.projectId)

  if (!project) return null

  return (
    <div className="filing-dialog-backdrop" role="presentation">
      <section
        className="filing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filing-dialog-title"
      >
        <div className="filing-dialog-header">
          <h3 id="filing-dialog-title">
            {step === 'preview' ? 'File tab to project' : 'Confirm filing'}
          </h3>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => onCancel(operation.operationId)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="filing-dialog-body">
          {step === 'preview' ? (
            <>
              <div className="filing-tab-preview">
                <strong>{operation.capturedTitle}</strong>
                <small>{operation.capturedUrl}</small>
              </div>
              <div className="filing-target">
                <Folder size={16} aria-hidden="true" />
                <span>Target project: <strong>{project.name}</strong></span>
              </div>
              {operation.existingSavedUrlId && (
                <p className="filing-existing-note">
                  This URL is already saved in {project.name}. The existing record will be kept.
                </p>
              )}
              {operation.suggestedTags.length > 0 && (
                <div className="filing-tags-preview">
                  <span className="field-label">Suggested tags</span>
                  <div className="tag-list">
                    {operation.suggestedTags.map((tag) => (
                      <span className="tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p>
                Protab will save &ldquo;{operation.capturedTitle}&rdquo; to <strong>{project.name}</strong> and
                request Chrome to close this tab.
              </p>
              <p className="filing-honesty-note">
                Some pages may show a native &ldquo;Leave page?&rdquo; warning. If you choose to stay,
                the URL will remain saved and the tab will need attention.
              </p>
            </>
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
          {step === 'preview' ? (
            <button
              className="button primary"
              onClick={() => setStep('confirm')}
              disabled={pending}
            >
              Continue
            </button>
          ) : (
            <button
              className="button primary"
              onClick={() => onConfirm(operation.operationId)}
              disabled={pending}
            >
              {pending ? 'Filing…' : 'Save and close'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
