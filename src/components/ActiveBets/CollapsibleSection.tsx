import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Optional accent (e.g. live = red dot) */
  accent?: 'live' | 'upcoming' | 'won' | 'lost' | 'cashout' | 'neutral';
}

const accentColors: Record<string, string> = {
  live: 'var(--app-error)',
  upcoming: 'var(--app-accent)',
  won: 'var(--app-accent)',
  lost: 'var(--app-error)',
  cashout: 'var(--app-accent)',
  neutral: 'var(--app-border)',
};

export function CollapsibleSection({
  title,
  count = 0,
  defaultOpen = true,
  children,
  accent = 'neutral',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg-card)' }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors cursor-pointer hover:opacity-90"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {accent !== 'neutral' && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${accent === 'live' ? 'animate-pulse' : ''}`}
              style={{ background: accentColors[accent] }}
              aria-hidden
            />
          )}
          <span className="font-bold uppercase tracking-wider text-sm" style={{ color: 'var(--app-text)' }}>
            {title}
          </span>
          {count >= 0 && (
            <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--app-text-muted)' }}>
              {count}
            </span>
          )}
        </div>
        <span
          className={`shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -my-2 -mr-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--app-text-muted)' }}
          aria-hidden
        >
          ▼
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
