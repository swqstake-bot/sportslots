import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';

const TOAST_DURATION_MS = 2800;

const typeStyles = {
  success: 'bg-[#00e701]/15 border-[#00e701] text-[#00e701]',
  error: 'bg-[#ff4d4d]/15 border-[#ff4d4d] text-[#ff4d4d]',
  info: 'bg-[#1475e1]/15 border-[#1475e1] text-[#b1bad3]',
};

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
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-5 py-2.5 rounded-lg border shadow-lg text-sm font-medium ${typeStyles[toast.type]}`}
    >
      {toast.message}
    </div>
  );
}
