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

const accentStyles = {
  live: 'bg-stake-error',
  upcoming: 'bg-stake-brand',
  won: 'bg-stake-success',
  lost: 'bg-stake-error',
  cashout: 'bg-stake-success',
  neutral: 'bg-stake-border',
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
    <section className="rounded-xl border border-stake-border bg-stake-bg-card overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-stake-bg-deep/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {accent !== 'neutral' && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${accentStyles[accent]} ${accent === 'live' ? 'animate-pulse' : ''}`}
              aria-hidden
            />
          )}
          <span className="font-bold text-white uppercase tracking-wider text-sm">
            {title}
          </span>
          {count >= 0 && (
            <span className="text-stake-text-muted text-sm font-medium tabular-nums">
              {count}
            </span>
          )}
        </div>
        <span
          className={`shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -my-2 -mr-2 text-stake-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
