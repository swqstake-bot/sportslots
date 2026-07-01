/**
 * SSP-style Bet-ID-Korrelation: providerBetId (GraphQL CasinoBet.id) ↔ houseBets share-iid.
 * Ein Pfad, O(1)-Lookup — kein FIFO/Slug/Multi/Logger-Fallback.
 */
import { subscribeToHouseBets } from '../api/stakeRealtimeFacade'
import {
  formatStakeShareBetId,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
  isStakeRgsInternalBetId,
} from './stakeBetShareId'
import { patchHubFeedEntryFromHouseBet } from './challengeHubBetIdPatch'

const MAP_MAX = 2000
const PENDING_MAX_AGE_MS = 60_000
const PENDING_MAX = 500

/** @type {Map<string, string>} */
const iidsMap = new Map()
/** @type {Map<string, object>} */
const pendingByApiId = new Map()
/** @type {Map<number, string>} */
const indexByBetIndex = new Map()
/** @type {Map<number, string>} */
const resolvedByBetIndex = new Map()
/** @type {Map<number, object>} */
const pendingByBetIndex = new Map()
/** @type {Map<string, object>} */
const wsPayloadBuffer = new Map()

/** @type {Set<(detail: object) => void>} */
const listeners = new Set()
/** @type {Set<(payload: object) => void>} */
const houseBetListeners = new Set()

/** @type {Map<string, number>} */
const tokenRefcount = new Map()
/** @type {{ disconnect?: () => void } | null} */
let houseBetSub = null
let houseBetToken = ''

function providerBetIdFromPayload(bItem) {
  const betId = bItem?.betId
  if (betId != null && String(betId).trim() !== '') return String(betId).trim()
  const topId = bItem?.id
  if (topId != null && /^\d+$/.test(String(topId).trim())) return String(topId).trim()
  return null
}

function shareIdFromPayload(bItem) {
  const raw = pickStakeHouseBetShareRawId({
    shareIid: bItem?.shareIid ?? bItem?.iid,
    houseTopId: bItem?.houseTopId ?? bItem?.id,
  })
  if (!raw) return null
  const formatted = formatStakeShareBetId(raw)
  return formatted && isPersistableStakeHouseBetShareId(formatted) ? formatted : null
}

function capMap(map, max = MAP_MAX) {
  while (map.size > max) {
    const first = map.keys().next().value
    if (first == null) break
    map.delete(first)
  }
}

function prune(now = Date.now()) {
  for (const [apiId, meta] of pendingByApiId) {
    if (now - (meta?.at || 0) > PENDING_MAX_AGE_MS) pendingByApiId.delete(apiId)
  }
  for (const [betIndex, meta] of pendingByBetIndex) {
    if (now - (meta?.at || 0) > PENDING_MAX_AGE_MS) pendingByBetIndex.delete(betIndex)
  }
  if (pendingByApiId.size > PENDING_MAX) {
    const oldest = [...pendingByApiId.entries()].sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))[0]
    if (oldest) pendingByApiId.delete(oldest[0])
  }
}

function emitResolved(detail) {
  for (const fn of listeners) {
    try {
      fn(detail)
    } catch {
      /* ignore */
    }
  }
}

function resolve(apiId, shareId, payload) {
  const key = String(apiId || '').trim()
  const sid = String(shareId || '').trim()
  if (!key || !sid) return false

  iidsMap.set(key, sid)
  capMap(iidsMap)

  const pending = pendingByApiId.get(key)
  if (pending?.feedEntryId && payload) {
    patchHubFeedEntryFromHouseBet(String(pending.feedEntryId), payload)
  }
  if (pending?.betIndex != null) {
    resolvedByBetIndex.set(pending.betIndex, sid)
    if (typeof pending.onResolved === 'function') {
      pending.onResolved(pending.betIndex, sid)
    }
    indexByBetIndex.set(pending.betIndex, key)
  }

  emitResolved({
    apiId: key,
    shareId: sid,
    feedEntryId: pending?.feedEntryId,
    betIndex: pending?.betIndex,
    payload,
  })
  wsPayloadBuffer.delete(key)
  return true
}

function tryResolveRegistered(apiId) {
  const key = String(apiId || '').trim()
  if (!key) return false
  const cached = iidsMap.get(key)
  if (cached) {
    return resolve(key, cached, wsPayloadBuffer.get(key) || null)
  }
  const buffered = wsPayloadBuffer.get(key)
  const shareId = buffered ? shareIdFromPayload(buffered) : null
  if (shareId) return resolve(key, shareId, buffered)
  return false
}

function onHouseBet(payload) {
  for (const fn of houseBetListeners) {
    try {
      fn(payload)
    } catch {
      /* ignore */
    }
  }
  const apiId = providerBetIdFromPayload(payload)
  const shareId = shareIdFromPayload(payload)
  if (!apiId) return
  if (shareId) {
    resolve(apiId, shareId, payload)
    return
  }
  wsPayloadBuffer.set(apiId, payload)
  capMap(wsPayloadBuffer, 256)
}

function attachHouseBetListener(accessToken) {
  const token = String(accessToken || '').trim()
  if (!token) return
  if (houseBetSub && houseBetToken === token) return

  try {
    houseBetSub?.disconnect?.()
  } catch {
    /* ignore */
  }
  houseBetSub = null
  houseBetToken = token

  void subscribeToHouseBets(token, (payload) => {
    onHouseBet(payload)
  }).then((sub) => {
    houseBetSub = sub
  })
}

function detachHouseBetListenerIfIdle() {
  let total = 0
  for (const n of tokenRefcount.values()) total += n
  if (total > 0) return
  try {
    houseBetSub?.disconnect?.()
  } catch {
    /* ignore */
  }
  houseBetSub = null
  houseBetToken = ''
}

export const betShareIdRegistry = {
  ensureListening(accessToken) {
    const token = String(accessToken || '').trim()
    if (!token) return
    tokenRefcount.set(token, (tokenRefcount.get(token) || 0) + 1)
    attachHouseBetListener(token)
  },

  releaseListening(accessToken) {
    const token = String(accessToken || '').trim()
    if (!token) return
    const next = (tokenRefcount.get(token) || 1) - 1
    if (next <= 0) tokenRefcount.delete(token)
    else tokenRefcount.set(token, next)
    detachHouseBetListenerIfIdle()
  },

  /**
   * @param {{ providerBetId?: string, betIndex?: number, feedEntryId?: string, runId?: string, onResolved?: (betIndex: number, shareId: string) => void, at?: number }} meta
   */
  register(meta) {
    prune()
    const at = meta?.at || Date.now()
    const apiId = meta?.providerBetId != null ? String(meta.providerBetId).trim() : ''

    if (!apiId || isStakeRgsInternalBetId(apiId)) {
      if (meta?.betIndex != null && !apiId) {
        pendingByBetIndex.set(meta.betIndex, { ...meta, at })
        const existing = resolvedByBetIndex.get(meta.betIndex)
        if (existing && typeof meta.onResolved === 'function') meta.onResolved(meta.betIndex, existing)
      }
      return
    }

    const entry = { ...meta, providerBetId: apiId, at }
    pendingByApiId.set(apiId, entry)
    if (meta?.betIndex != null) {
      indexByBetIndex.set(meta.betIndex, apiId)
      pendingByBetIndex.delete(meta.betIndex)
    }

    if (tryResolveRegistered(apiId)) return
    const existingShare = iidsMap.get(apiId)
    if (existingShare) resolve(apiId, existingShare, wsPayloadBuffer.get(apiId) || null)
  },

  linkApiId(betIndex, providerBetId) {
    const key = providerBetId != null ? String(providerBetId).trim() : ''
    if (!key || betIndex == null) return

    prune()
    const pre = pendingByBetIndex.get(betIndex)
    const merged = {
      ...(pre || {}),
      betIndex,
      providerBetId: key,
      at: pre?.at || Date.now(),
    }
    pendingByBetIndex.delete(betIndex)
    indexByBetIndex.set(betIndex, key)
    pendingByApiId.set(key, merged)

    if (tryResolveRegistered(key)) return
    const existingShare = iidsMap.get(key)
    if (existingShare) resolve(key, existingShare, wsPayloadBuffer.get(key) || null)
  },

  getShareId(providerBetId) {
    const key = String(providerBetId || '').trim()
    if (!key) return null
    return iidsMap.get(key) || null
  },

  getShareIdByBetIndex(betIndex) {
    if (betIndex == null) return null
    const cached = resolvedByBetIndex.get(betIndex)
    if (cached) return cached
    const apiId = indexByBetIndex.get(betIndex)
    if (!apiId) return null
    return iidsMap.get(apiId) || null
  },

  onHouseBet(payload) {
    onHouseBet(payload)
  },

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  subscribeHouseBets(listener) {
    if (typeof listener !== 'function') return () => {}
    houseBetListeners.add(listener)
    return () => houseBetListeners.delete(listener)
  },

  clearSession() {
    iidsMap.clear()
    pendingByApiId.clear()
    indexByBetIndex.clear()
    resolvedByBetIndex.clear()
    pendingByBetIndex.clear()
    wsPayloadBuffer.clear()
  },

  /** @deprecated use clearSession */
  clearBuffers() {
    this.clearSession()
  },
}
