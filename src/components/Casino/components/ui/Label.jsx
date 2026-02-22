/**
 * Form label with optional tooltip.
 */
export function Label({ children, htmlFor, title, style, ...props }) {
  const base = {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-1)',
  }
  return (
    <label htmlFor={htmlFor} title={title} style={{ ...base, ...style }} {...props}>
      {children}
    </label>
  )
}
