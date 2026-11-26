import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  fetchStakeSlots,
  NEW_SLOTS_REFRESH_INTERVAL_MS,
  reloadAllSlots,
  getSlotReloadState,
  subscribeSlotReload,
  subscribeSlotCatalog,
} from '../api/stakeSlotsApi'

/**
 * Status + Auslöser für „Slots aktualisieren“ (kompletter Katalog-Scan). Der Status liegt global
 * in stakeSlotsApi, damit Button und useSlots (in verschiedenen Komponenten) synchron bleiben.
 */
export function useSlotCatalogReload() {
  const [state, setState] = useState(getSlotReloadState)
  useEffect(() => subscribeSlotReload(setState), [])
  const reload = useCallback(() => reloadAllSlots().catch((e) => {
    console.warn('[Slots] Vollreload fehlgeschlagen:', e?.message || e)
    return null
  }), [])
  return { reload, reloading: state.running, progress: state.progress, lastResult: state.lastResult }
}

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
  const { reload, reloading, progress } = useSlotCatalogReload()

  // Manueller Vollreload („Slots aktualisieren“) → neuen Katalog sofort übernehmen.
  useEffect(() => subscribeSlotCatalog((list) => {
    if (Array.isArray(list) && list.length) {
      setDynamicSlots(list)
      setError('')
    }
  }), [])

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

    // Neue Releases regelmäßig im Hintergrund nachladen — sonst kamen neue Slots in lang
    // laufenden Sessions nur noch über Challenges (discoveredSlots) in die Liste.
    let refreshing = false
    const refreshNewSlots = () => {
      if (cancelled || refreshing) return
      refreshing = true
      fetchStakeSlots(accessToken, { force: true })
        .then((list) => {
          if (cancelled || !list?.length) return
          setDynamicSlots((prev) => {
            if (prev === list) return prev
            if (list.length !== prev.length) {
              console.log('[Slots] Hintergrund-Reload: %d → %d Slots', prev.length, list.length)
            }
            return list
          })
        })
        .catch((e) => console.warn('[Slots] Hintergrund-Reload fehlgeschlagen:', e?.message || e))
        .finally(() => { refreshing = false })
    }
    const intervalId = setInterval(refreshNewSlots, NEW_SLOTS_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [accessToken])

  const webSlots = useMemo(
    () => mergeSlots(dynamicSlots, discoveredSlots),
    [dynamicSlots, discoveredSlots]
  )
  return { slots: webSlots, loading, error, reload, reloading, progress }
}
