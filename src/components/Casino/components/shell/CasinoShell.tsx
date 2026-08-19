import type { ReactNode } from 'react'
import { CasinoTopNav } from './CasinoTopNav'

interface CasinoShellProps {
  error: string
  slotsError: string
  slotsLoading: boolean
  token: string
  mode: string
  onChangeMode: (mode: 'play' | 'originals' | 'challengeHub' | 'promotions' | 'bonushunt' | 'logs') => void
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
  const sessionOk = Boolean(token)

  return (
    <div className="casino-root min-h-screen font-sans" style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}>
      <div className="casino-shell-page w-full max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-5 py-3">
        <div className="casino-shell-stack">
          <header className="casino-shell-header casino-shell-header--compact">
            <div className="casino-shell-title-row">
              <CasinoTopNav mode={mode} onChangeMode={onChangeMode} />
              <div className={`casino-shell-status ${sessionOk ? 'is-connected' : 'is-disconnected'}`}>
                <span className="casino-shell-status-dot" aria-hidden />
                <span>{sessionOk ? 'Connected' : 'No session'}</span>
                <button
                  type="button"
                  onClick={() => void onRefreshSession()}
                  className="casino-shell-session-action"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className={`casino-shell-session-action ${mode === 'logs' ? 'is-active' : ''}`}
                  title="API logs and diagnostics"
                  onClick={() => onChangeMode('logs')}
                >
                  Logs
                </button>
              </div>
            </div>
          </header>
          <main className="casino-shell-main animate-in fade-in duration-500">
            {error && (
              <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5 mb-3">
                <p className="text-sm font-medium text-[var(--error)]">{error}</p>
              </div>
            )}
            {slotsError && !error && (
              <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5 mb-3">
                <p className="text-sm font-medium text-[var(--error)]">Slots: {slotsError}</p>
              </div>
            )}
            {slotsLoading && token && (
              <p className="text-[0.7rem] text-[var(--text-muted)] mb-2">Loading slots…</p>
            )}
            <section className="casino-content-frame">{children}</section>
          </main>
        </div>
      </div>
    </div>
  )
}
