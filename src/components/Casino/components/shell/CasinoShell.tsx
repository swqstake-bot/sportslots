import { useEffect, type ReactNode } from 'react'
import { AppBrandMark } from '../../../AppShell/AppBrandMark'
import { APP_NAME, APP_TAGLINE } from '../../../../constants/branding'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import { useUiStore } from '../../../../store/uiStore'
import { CasinoTopNav } from './CasinoTopNav'

interface CasinoShellProps {
  error: string
  slotsError: string
  slotsLoading: boolean
  token: string
  mode: string
  onChangeMode: (mode: 'play' | 'originals' | 'challengeHub' | 'promotions' | 'bonushunt' | 'logs') => void
  onRefreshSession: () => void | Promise<void>
  onLogin?: () => void | Promise<void>
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
  onLogin,
  children,
}: CasinoShellProps) {
  const sessionOk = Boolean(token)
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const showToast = useUiStore((s) => s.showToast)
  const loginLabel = preferredSite === 'eu' ? 'Login Stake.eu' : 'Login with Stake'

  useEffect(() => {
    if (error) showToast(error, 'error')
  }, [error, showToast])

  useEffect(() => {
    if (slotsError && !error && sessionOk) showToast(`Slots: ${slotsError}`, 'error')
  }, [slotsError, error, sessionOk, showToast])

  return (
    <div className="casino-root min-h-screen font-sans" style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}>
      <div className="casino-shell-page w-full max-w-[1920px] mx-auto px-2 sm:px-3 lg:px-4 py-2">
        <div className="casino-shell-stack">
          <header className="casino-shell-header casino-shell-header--compact">
            <div className="casino-shell-title-row">
              <CasinoTopNav mode={mode} onChangeMode={onChangeMode} />
              <div className={`casino-shell-status ${sessionOk ? 'is-connected' : 'is-disconnected'}`}>
                <span className="casino-shell-status-dot" aria-hidden />
                <span>{sessionOk ? 'Connected' : 'No session'}</span>
                {!sessionOk && onLogin && (
                  <button
                    type="button"
                    onClick={() => void onLogin()}
                    className="casino-shell-session-action"
                  >
                    Login
                  </button>
                )}
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
                  title="API debug and diagnostics"
                  onClick={() => onChangeMode('logs')}
                >
                  API Debug
                </button>
              </div>
            </div>
          </header>
          <main className="casino-shell-main animate-in fade-in duration-500">
            {slotsLoading && token && (
              <p className="text-[0.7rem] text-[var(--text-muted)] mb-2">Loading slots…</p>
            )}
            {!sessionOk ? (
              <section className="app-login-empty">
                <AppBrandMark size={56} />
                <h2>Welcome to {APP_NAME}</h2>
                <p>{APP_TAGLINE}. Login with Stake to open slots, originals and hunter.</p>
                <button type="button" onClick={() => void onLogin?.()}>
                  {loginLabel}
                </button>
              </section>
            ) : (
              <section className="casino-content-frame">{children}</section>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
