import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AccordionSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  /** When false, section is always expanded (dashboard panels). */
  collapsible?: boolean;
  variant?: 'default' | 'glass';
  children: React.ReactNode;
}

export function AccordionSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  collapsible = true,
  variant = 'default',
  children,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const expanded = collapsible ? isOpen : true;
  const isGlass = variant === 'glass';

  return (
    <section
      className={`autobet-panel ${isGlass ? 'autobet-panel--glass' : 'autobet-panel--default'} ${expanded ? 'is-open' : ''}`.trim()}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="autobet-panel-header autobet-panel-header--btn"
        >
          <PanelHeaderContent title={title} subtitle={subtitle} icon={icon} />
          <span
            className={`autobet-panel-chevron ${expanded ? 'is-open' : ''}`.trim()}
            aria-hidden
          >
            ▼
          </span>
        </button>
      ) : (
        <div className="autobet-panel-header">
          <PanelHeaderContent title={title} subtitle={subtitle} icon={icon} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="autobet-panel-body-wrap"
          >
            <div className="autobet-panel-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function PanelHeaderContent({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="autobet-panel-header-text">
      {icon ? <span className="autobet-panel-icon">{icon}</span> : null}
      <div className="min-w-0">
        <span className="autobet-panel-title">{title}</span>
        {subtitle ? <span className="autobet-panel-subtitle">{subtitle}</span> : null}
      </div>
    </div>
  );
}
