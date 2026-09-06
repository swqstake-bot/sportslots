import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';

const TOAST_DURATION_MS = 3000;

const typeStyles = {
  success: {
    background: 'var(--app-bg-elevated)',
    borderColor: 'color-mix(in srgb, var(--app-success) 45%, var(--app-border))',
    color: 'var(--app-success)',
  },
  error: {
    background: 'var(--app-bg-elevated)',
    borderColor: 'color-mix(in srgb, var(--app-error) 45%, var(--app-border))',
    color: 'var(--app-error)',
  },
  info: {
    background: 'var(--app-bg-elevated)',
    borderColor: 'var(--app-border)',
    color: 'var(--app-text)',
  },
} as const;

export function GlobalToast() {
  const { toast, clearToast } = useUiStore();

  useEffect(() => {
    if (!toast.message) return;
    const t = setTimeout(clearToast, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast.message, toast.type, clearToast]);

  if (!toast.message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[10000] border shadow-none font-medium cursor-pointer"
      style={{
        right: '0.85rem',
        bottom: '0.85rem',
        left: 'auto',
        maxWidth: '22rem',
        padding: '0.42rem 0.7rem',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        ...typeStyles[toast.type],
      }}
      onClick={clearToast}
    >
      {toast.message}
    </div>
  );
}
