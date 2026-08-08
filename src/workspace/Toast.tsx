import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export interface ToastProps {
  message: string
  type: 'success' | 'error'
  duration: number
  onDismiss: () => void
}

export function Toast({ message, type, duration, onDismiss }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const remainingRef = useRef(duration)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    if (isPaused) {
      // Clear the timer and track remaining time
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      remainingRef.current -= Date.now() - startTimeRef.current
    } else {
      // Start or resume the timer
      startTimeRef.current = Date.now()
      timerRef.current = setTimeout(() => {
        onDismiss()
      }, remainingRef.current)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isPaused, onDismiss])

  return (
    <div
      className={`toast toast-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
