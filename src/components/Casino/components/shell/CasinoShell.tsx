import { useEffect, useRef, type ReactNode } from 'react'
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
  const toolsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        toolsRef.current.open = false
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && toolsRef.current?.open) {
        toolsRef.current.open = false
        toolsRef.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

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
              <details ref={toolsRef} className="casino-tools">
                <summary className={`casino-tools-trigger${mode === 'logs' ? ' is-active' : ''}`}>
                  Casino tools <span aria-hidden>▾</span>
                </summary>
                <div className="casino-tools-menu">
                  <p className="casino-tools-caption">Connection &amp; diagnostics</p>
                  {!sessionOk && onLogin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (toolsRef.current) toolsRef.current.open = false
                        void onLogin()
                      }}
                    >
                      Connect to Stake
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (toolsRef.current) toolsRef.current.open = false
                      void onRefreshSession()
                    }}
                  >
                    Refresh Casino
                    <span>Reconnect the casino session</span>
                  </button>
                  <button
                    type="button"
                    className={mode === 'logs' ? 'is-active' : undefined}
                    aria-current={mode === 'logs' ? 'page' : undefined}
                    onClick={() => {
                      if (toolsRef.current) toolsRef.current.open = false
                      onChangeMode('logs')
                    }}
                  >
                    API diagnostics
                    <span>Requests, responses and casino logs</span>
                  </button>
                </div>
              </details>
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
