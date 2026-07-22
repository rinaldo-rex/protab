interface ArchiveConfirmDialogProps {
  title: string
  onArchiveAndClose: () => void
  onArchiveOnly: () => void
  onCancel: () => void
  pending?: boolean
}

export function ArchiveConfirmDialog({ title, onArchiveAndClose, onArchiveOnly, onCancel, pending }: ArchiveConfirmDialogProps) {
  return (
    <div className="filing-dialog-backdrop" role="presentation">
      <section className="filing-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-confirm-title">
        <div className="filing-dialog-header">
          <h3 id="archive-confirm-title">Archive "{title}"?</h3>
        </div>
        <div className="filing-dialog-body">
          <p className="filing-honesty-note">This tab is currently open. What would you like to do?</p>
        </div>
        <div className="filing-dialog-actions">
          <button className="button secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button className="button secondary" onClick={onArchiveOnly} disabled={pending}>Archive only</button>
          <button className="button primary" onClick={onArchiveAndClose} disabled={pending}>{pending ? 'Archiving…' : 'Archive and close'}</button>
        </div>
      </section>
    </div>
  )
}
