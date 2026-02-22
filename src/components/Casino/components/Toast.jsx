import { useEffect } from 'react'

const TOAST_DURATION = 2800

export function Toast({ message, visible, onHide }) {
  useEffect(() => {
    if (!visible || !message) return
    const t = setTimeout(() => onHide?.(), TOAST_DURATION)
    return () => clearTimeout(t)
  }, [visible, message, onHide])

  if (!visible || !message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '0.6rem 1.25rem',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        color: 'var(--text)',
        fontSize: '0.9rem',
        fontWeight: 500,
        zIndex: 2000,
      }}
    >
      {message}
    </div>
  )
}
