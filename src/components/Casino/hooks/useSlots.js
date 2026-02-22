import { useState, useEffect, useMemo } from 'react'
import { fetchStakeSlots } from '../api/stakeSlotsApi'
import { SUPPORTED_SLOTS } from '../constants/slots'

const STATIC_SLOTS = SUPPORTED_SLOTS

function mergeSlots(staticList, dynamicList, discoveredList = []) {
  const bySlug = new Map()
  for (const s of staticList) {
    bySlug.set(s.slug, { ...s })
  }
  for (const s of dynamicList) {
    if (!bySlug.has(s.slug)) bySlug.set(s.slug, { ...s })
  }
  for (const s of discoveredList) {
    if (!bySlug.has(s.slug)) bySlug.set(s.slug, { ...s })
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
      .then((list) => { if (!cancelled) setDynamicSlots(list) })
      .catch((e) => {
        if (!cancelled) {
          setDynamicSlots([])
          setError(e?.message || 'Slots laden fehlgeschlagen')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accessToken])

  const webSlots = useMemo(
    () => mergeSlots(STATIC_SLOTS, dynamicSlots, discoveredSlots),
    [dynamicSlots, discoveredSlots]
  )
  return { slots: webSlots, loading, error }
}
