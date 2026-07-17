import { useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  accent?: 'live' | 'upcoming' | 'won' | 'lost' | 'cashout' | 'neutral';
  variant?: 'card' | 'compact';
}

export function CollapsibleSection({
  title,
  count = 0,
  defaultOpen = true,
  children,
  accent = 'neutral',
  variant = 'compact',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (variant === 'compact') {
    return (
      <section className="bet-group">
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="bet-group-header"
        >
          <span className="bet-group-header-left">
            {accent !== 'neutral' && (
              <span className={`bet-group-dot bet-group-dot--${accent}`} aria-hidden />
            )}
            <span className="bet-group-title">{title}</span>
            <span className="bet-group-count">{count}</span>
          </span>
          <span className={`bet-group-chevron ${isOpen ? 'is-open' : ''}`.trim()} aria-hidden>
            ›
          </span>
        </button>
        {isOpen && <div className="bet-group-list">{children}</div>}
      </section>
    );
  }

  return (
    <section className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg-card)' }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer hover:opacity-90"
        style={{ background: 'transparent' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {accent !== 'neutral' && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${accent === 'live' ? 'animate-pulse' : ''}`}
              style={{
                background:
                  accent === 'live' || accent === 'lost'
                    ? 'var(--app-error)'
                    : 'var(--app-accent)',
              }}
              aria-hidden
            />
          )}
          <span className="font-bold uppercase tracking-wider text-xs" style={{ color: 'var(--app-text)' }}>
            {title}
          </span>
          {count >= 0 && (
            <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--app-text-muted)' }}>
              {count}
            </span>
          )}
        </div>
        <span className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--app-text-muted)' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2.5">
          {children}
        </div>
      )}
    </section>
  );
}
