/**
 * useOriginals – komplett unabhängig von useSlots.
 * Lädt Stake-Originals-Spiele (Gruppe stake-originals).
 */

import { useState, useEffect } from 'react'
import { fetchStakeOriginals } from '../api/stakeOriginalsApi'

export function useOriginals(accessToken) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken?.trim()) {
      setGames([])
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchStakeOriginals(accessToken)
      .then((list) => {
        if (!cancelled) {
          setGames(list || [])
          if (list?.length) console.log('[Originals] %d Spiele geladen', list.length)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setGames([])
          setError(e?.message || 'Originals laden fehlgeschlagen')
          console.error('[Originals] Fehler:', e?.message)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken])

  return { games, loading, error }
}
