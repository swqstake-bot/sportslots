import { useEffect, useState } from 'react'

export function useCasinoSession() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'connected'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const initSession = async () => {
      try {
        const t = await window.electronAPI.getSessionToken()
        if (cancelled) return
        if (t) {
          setToken(t)
          setStatus('connected')
        } else {
          setError('No active Stake session found. Please navigate to Stake in the app.')
        }
      } catch (e) {
        if (cancelled) return
        console.error('Failed to get session token', e)
        setError('Failed to access session.')
      }
    }
    initSession()
    return () => {
      cancelled = true
    }
  }, [])

  return { token, status, error, setError }
}
