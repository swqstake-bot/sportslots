import type { ReactNode } from 'react'
import { CasinoTopNav } from './CasinoTopNav'

interface CasinoShellProps {
  error: string
  slotsError: string
  slotsLoading: boolean
  token: string
  mode: string
  onChangeMode: (mode: 'play' | 'originals' | 'challenges' | 'telegram' | 'bonushunt' | 'forum' | 'logs') => void
  children: ReactNode
}

export function CasinoShell({
  error,
  slotsError,
  slotsLoading,
  token,
  mode,
  onChangeMode,
  children,
}: CasinoShellProps) {
  return (
    <div className="casino-root min-h-screen font-sans" style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}>
      <div className="p-6 lg:p-8 w-full">
        <header className="casino-shell-header">
          <div className="casino-shell-title-row">
            <div>
              <p className="casino-shell-kicker">StakeSports Casino</p>
              <h1 className="casino-shell-title">Control Center</h1>
            </div>
            <div className="casino-shell-status">
              <span className="casino-shell-status-dot"></span>
              <span>{token ? 'Session connected' : 'Session missing'}</span>
            </div>
          </div>
          <CasinoTopNav mode={mode} onChangeMode={onChangeMode} />
        </header>
        <main className="animate-in fade-in duration-500 space-y-6">
          {error && (
            <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5">
              <p className="text-sm font-medium text-[var(--error)]">{error}</p>
            </div>
          )}
          {slotsError && !error && (
            <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5">
              <p className="text-sm font-medium text-[var(--error)]">Slots: {slotsError}</p>
            </div>
          )}
          {slotsLoading && token && (
            <div className="space-y-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div
                  className="h-full min-w-[30%] rounded-full bg-[var(--accent)] opacity-80"
                  style={{ animation: 'slots-loading-shimmer 1.5s ease-in-out infinite' }}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">Loading slots…</p>
            </div>
          )}
          <section className="casino-content-frame">{children}</section>
        </main>
      </div>
    </div>
  )
}
