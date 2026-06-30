import { useCallback, useEffect, useState } from 'react'
import { AppBrandMark, AppBrandTitle } from './AppBrandMark'

function hasFramelessChrome(): boolean {
  return Boolean(window.electronAPI?.isFrameless)
}

export function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false)

  const refreshMaximized = useCallback(async () => {
    const api = window.electronAPI
    if (!api?.windowIsMaximized) return
    try {
      setMaximized(await api.windowIsMaximized())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!hasFramelessChrome()) return
    void refreshMaximized()
    const onResize = () => {
      void refreshMaximized()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [refreshMaximized])

  if (!hasFramelessChrome()) return null

  const api = window.electronAPI

  const onMinimize = () => {
    void api.windowMinimize?.()
  }

  const onMaximize = async () => {
    await api.windowMaximize?.()
    await refreshMaximized()
  }

  const onClose = () => {
    void api.windowClose?.()
  }

  return (
    <header className="window-titlebar" aria-label="Window title bar">
      <div className="window-titlebar-drag">
        <AppBrandMark size={18} className="window-titlebar-logo" />
        <AppBrandTitle className="window-titlebar-brand" />
      </div>
      <div className="window-titlebar-controls">
        <button type="button" className="window-titlebar-btn" onClick={onMinimize} aria-label="Minimize window">
          <svg viewBox="0 0 10 1" aria-hidden="true">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="window-titlebar-btn" onClick={() => void onMaximize()} aria-label={maximized ? 'Restore window' : 'Maximize window'}>
          {maximized ? (
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2.5 0.5h5v2h2.5v7h-7.5v-9zm1 1v7h5.5v-5.5h-1.5v-1h-4z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button type="button" className="window-titlebar-btn is-close" onClick={onClose} aria-label="Close window">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  )
}
