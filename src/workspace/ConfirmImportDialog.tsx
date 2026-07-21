import { useState } from 'react'
import { Upload, Merge, Plus } from 'lucide-react'

interface ConfirmImportDialogProps {
  projectName: string
  existingProjectName: string
  urlCount: number
  onMerge: () => void
  onCreateNew: (suffix: string) => void
  onCancel: () => void
  pending?: boolean
}

export function ConfirmImportDialog({ projectName, existingProjectName, urlCount, onMerge, onCreateNew, onCancel, pending }: ConfirmImportDialogProps) {
  const [suffix, setSuffix] = useState(' (imported)')
  const [mode, setMode] = useState<'choose' | 'create-new'>('choose')

  if (mode === 'create-new') {
    return (
      <div className="filing-dialog-backdrop" role="presentation">
        <section className="filing-dialog" role="dialog" aria-modal="true" aria-labelledby="import-new-title">
          <div className="filing-dialog-header">
            <h3 id="import-new-title">Create as new project</h3>
          </div>
          <div className="filing-dialog-body">
            <p>The imported project will be created as "{projectName}{suffix}".</p>
            <label htmlFor="import-suffix">Suffix</label>
            <input id="import-suffix" value={suffix} maxLength={20} onChange={(e) => setSuffix(e.target.value)} autoFocus />
          </div>
          <div className="filing-dialog-actions">
            <button className="button secondary" onClick={() => setMode('choose')} disabled={pending}>Back</button>
            <button className="button primary" onClick={() => onCreateNew(suffix)} disabled={pending}>
              {pending ? 'Importing…' : 'Create project'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="filing-dialog-backdrop" role="presentation">
      <section className="filing-dialog" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title">
        <div className="filing-dialog-header">
          <h3 id="import-confirm-title"><Upload size={18} /> Import project</h3>
        </div>
        <div className="filing-dialog-body">
          <p>A project named <strong>"{projectName}"</strong> already exists ({existingProjectName}).</p>
          <p>The import contains {urlCount} URL{urlCount !== 1 ? 's' : ''}. What would you like to do?</p>
        </div>
        <div className="filing-dialog-actions">
          <button className="button secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button className="button secondary" onClick={() => setMode('create-new')} disabled={pending}>
            <Plus size={14} /> Create new
          </button>
          <button className="button primary" onClick={onMerge} disabled={pending}>
            <Merge size={14} /> {pending ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </section>
    </div>
  )
}
