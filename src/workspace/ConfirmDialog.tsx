import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, children, confirmLabel, destructive, pending, onConfirm, onCancel }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (typeof dialog?.showModal === 'function') dialog.showModal()
    else dialog?.setAttribute('open', '')
    return () => {
      if (typeof dialog?.close === 'function') dialog.close()
      else dialog?.removeAttribute('open')
    }
  }, [])

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); onConfirm() }}>
        <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onCancel}><X size={18} /></button></div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className={destructive ? 'button danger' : 'button primary'} disabled={pending}>{confirmLabel}</button></div>
      </form>
    </dialog>
  )
}
