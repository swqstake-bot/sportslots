import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';

const TOAST_DURATION_MS = 2800;

const typeStyles = {
  success: {
    background: 'rgba(0, 255, 136, 0.14)',
    borderColor: 'rgba(0, 255, 136, 0.45)',
    color: 'var(--app-success)',
  },
  error: {
    background: 'rgba(255, 51, 102, 0.14)',
    borderColor: 'rgba(255, 51, 102, 0.45)',
    color: 'var(--app-error)',
  },
  info: {
    background: 'rgba(var(--app-accent-rgb), 0.14)',
    borderColor: 'rgba(var(--app-accent-rgb), 0.45)',
    color: 'var(--app-text)',
  },
} as const;

export function GlobalToast() {
  const { toast, clearToast } = useUiStore();

  useEffect(() => {
    if (!toast.message) return;
    const t = setTimeout(clearToast, TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast.message, clearToast]);

  if (!toast.message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-5 py-2.5 rounded-lg border shadow-lg text-sm font-medium"
      style={typeStyles[toast.type]}
    >
      {toast.message}
    </div>
  );
}
