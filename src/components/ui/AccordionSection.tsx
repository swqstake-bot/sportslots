import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AccordionSection({
  title,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg-card)' }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer"
        style={{ color: 'var(--app-text)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span className="font-bold text-sm uppercase tracking-wider">
          {title}
        </span>
        <span
          className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0" style={{ borderTop: '1px solid color-mix(in srgb, var(--app-border) 60%, transparent)' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
