import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  danger?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Shared button with variant support.
 */
export function Button({ 
  children, 
  variant = 'primary', 
  danger, 
  disabled, 
  style, 
  size = 'md',
  className,
  ...props 
}: ButtonProps) {
  const base: React.CSSProperties = {
    padding: 'var(--space-3) var(--space-5)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontSize: 'var(--text-base)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  }

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--bg-deep)' },
    secondary: {
      background: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
      fontSize: 'var(--text-sm)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-muted)',
      border: 'none',
    },
    danger: {
      background: 'var(--error)',
      color: 'white',
    }
  }

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: 'var(--space-2) var(--space-3)', fontSize: '0.8rem' },
    md: { padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-base)' },
    lg: { padding: 'var(--space-4) var(--space-6)', fontSize: '1.1rem' },
  }

  // Merge styles
  let s = { ...base }
  
  if (danger) {
    s = { ...s, ...variants.danger }
  } else if (variant && variants[variant]) {
    s = { ...s, ...variants[variant] }
  }

  if (size && sizes[size]) {
    s = { ...s, ...sizes[size] }
  }

  // Handle className if passed (for Tailwind classes)
  // If className contains bg/text/border, they might override style.
  // But style prop has precedence over class in React? No, style inline overrides class.
  // However, we are merging `s` into `style`.
  
  return (
    <button 
      type="button" 
      style={{ ...s, ...style }} 
      disabled={disabled} 
      className={className}
      {...props}
    >
      {children}
    </button>
  )
}
