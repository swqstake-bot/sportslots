import { useState, useEffect, useMemo } from 'react'
import { fetchStakeSlots } from '../api/stakeSlotsApi'

function mergeSlots(dynamicList, discoveredList = []) {
  const bySlug = new Map()
  for (const s of dynamicList) {
    bySlug.set(s.slug, { ...s })
  }
  for (const s of discoveredList) {
    const existing = bySlug.get(s.slug)
    if (existing && s.thumbnailUrl) existing.thumbnailUrl = s.thumbnailUrl
    else if (!bySlug.has(s.slug)) bySlug.set(s.slug, { ...s })
  }
  return Array.from(bySlug.values())
}

export function useSlots(accessToken, discoveredSlots = []) {
  const [dynamicSlots, setDynamicSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken?.trim()) {
      setDynamicSlots([])
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchStakeSlots(accessToken)
      .then((list) => {
        if (!cancelled) {
          setDynamicSlots(list)
          if (list?.length) console.log('[Slots] useSlots: %d Slots geladen', list.length)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDynamicSlots([])
          setError(e?.message || 'Slots laden fehlgeschlagen')
          console.error('[Slots] useSlots Fehler:', e?.message)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken])

  const webSlots = useMemo(
    () => mergeSlots(dynamicSlots, discoveredSlots),
    [dynamicSlots, discoveredSlots]
  )
  return { slots: webSlots, loading, error }
}
