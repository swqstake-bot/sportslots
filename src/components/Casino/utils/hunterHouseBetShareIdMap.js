/** LRU-style cap for providerBetId → shareId lookups (SSP processedIids pattern). */
export const HOUSE_SHARE_ID_MAP_MAX = 1000

export function setHouseShareIdLookup(mapRef, providerBetId, shareId) {
  const key = String(providerBetId || '').trim()
  if (!key || shareId == null || String(shareId).trim() === '') return
  const map = mapRef.current
  if (map.has(key)) map.delete(key)
  map.set(key, shareId)
  while (map.size > HOUSE_SHARE_ID_MAP_MAX) {
    const first = map.keys().next().value
    map.delete(first)
  }
}

export function getHouseShareIdLookup(mapRef, providerBetId) {
  const key = String(providerBetId || '').trim()
  if (!key) return undefined
  return mapRef.current.get(key)
}

export function deleteHouseShareIdLookup(mapRef, providerBetId) {
  const key = String(providerBetId || '').trim()
  if (key) mapRef.current.delete(key)
}
