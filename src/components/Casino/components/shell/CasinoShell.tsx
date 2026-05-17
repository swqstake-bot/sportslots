import type { ReactNode } from 'react'
import { CasinoTopNav } from './CasinoTopNav'

interface CasinoShellProps {
  error: string
  slotsError: string
  slotsLoading: boolean
  token: string
  mode: string
  onChangeMode: (mode: 'play' | 'originals' | 'challengeHub' | 'bonushunt' | 'logs') => void
  onRefreshSession: () => void | Promise<void>
  children: ReactNode
}

export function CasinoShell({
  error,
  slotsError,
  slotsLoading,
  token,
  mode,
  onChangeMode,
  onRefreshSession,
  children,
}: CasinoShellProps) {
  const sessionOk = Boolean(token);

  return (
    <div className="casino-root min-h-screen font-sans" style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}>
      <div className="casino-shell-page w-full max-w-[1920px] mx-auto p-4 sm:p-5 lg:p-6 xl:p-7">
        <div className="casino-shell-stack">
          <header className="casino-shell-header">
            <div className="casino-shell-title-row">
              <div>
                <p className="casino-shell-kicker">Stakesports · Casino</p>
                <h1 className="casino-shell-title">Control center</h1>
                <p className="casino-shell-sub">Slots, automation &amp; tools — same Stake session as Sports.</p>
              </div>
              <div className={`casino-shell-status ${sessionOk ? 'is-connected' : 'is-disconnected'}`}>
                <span className="casino-shell-status-dot" aria-hidden />
                <span>{sessionOk ? 'Session connected' : 'No casino session'}</span>
                <button
                  type="button"
                  onClick={() => void onRefreshSession()}
                  className="casino-shell-session-action"
                >
                  Refresh session
                </button>
              </div>
            </div>
            <CasinoTopNav mode={mode} onChangeMode={onChangeMode} />
          </header>
          <main className="casino-shell-main animate-in fade-in duration-500 space-y-6">
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
    </div>
  )
}
