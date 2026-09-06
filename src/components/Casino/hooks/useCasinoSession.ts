import { useCallback, useEffect, useState } from 'react'

export function useCasinoSession() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'checking' | 'connected' | 'missing'>('checking')
  const [error, setError] = useState('')

  const refreshSession = useCallback(async () => {
    setStatus((prev) => (prev === 'connected' ? prev : 'checking'))
    try {
      const sessionStatus = await window.electronAPI.getStakeSessionStatus?.()
      const t = sessionStatus?.sessionToken || await window.electronAPI.getSessionToken()
      if (t) {
        setToken(t)
        setStatus('connected')
        setError('')
      } else {
        setToken('')
        setStatus('missing')
        setError('')
      }
    } catch (e) {
      console.error('Failed to get session token', e)
      setToken('')
      setStatus('missing')
      setError('Failed to access session.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const initSession = async () => {
      try {
        const sessionStatus = await window.electronAPI.getStakeSessionStatus?.()
        const t = sessionStatus?.sessionToken || await window.electronAPI.getSessionToken()
        if (cancelled) return
        if (t) {
          setToken(t)
          setStatus('connected')
          setError('')
        } else {
          setToken('')
          setStatus('missing')
          setError('')
        }
      } catch (e) {
        if (cancelled) return
        console.error('Failed to get session token', e)
        setToken('')
        setStatus('missing')
        setError('Failed to access session.')
      }
    }
    initSession()
    const handleSessionRefresh = () => {
      if (!cancelled) void refreshSession()
    }
    window.addEventListener('stake-session-revalidated', handleSessionRefresh)
    window.addEventListener('focus', handleSessionRefresh)
    return () => {
      cancelled = true
      window.removeEventListener('stake-session-revalidated', handleSessionRefresh)
      window.removeEventListener('focus', handleSessionRefresh)
    }
  }, [refreshSession])

  return { token, status, error, setError, refreshSession }
}
