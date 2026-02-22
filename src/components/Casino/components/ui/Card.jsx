/**
 * Card container with optional elevated variant.
 */
export function Card({ children, elevated, style, ...props }) {
  const base = {
    background: elevated ? 'var(--bg-elevated)' : 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-5)',
  }
  return (
    <div style={{ ...base, ...style }} {...props}>
      {children}
    </div>
  )
}
