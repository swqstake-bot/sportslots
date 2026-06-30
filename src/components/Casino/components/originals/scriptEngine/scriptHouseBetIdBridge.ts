/**
 * Script-Mode: Share-IDs aus houseBets / myBetUpdated (house:460… / casino:uuid).
 * Primär: betApiId (Mutation `id`) ↔ WS `bet.id` (houseBets) bzw. numerische `id` (myBetUpdated).
 * Fallback: FIFO wenn betApiId fehlt oder nur Share-ID ohne Provider-ID ankommt.
 */

import { subscribeToHouseBets } from '../../../api/stakeRealtimeFacade'
import {
  formatStakeShareBetId,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
} from '../../../utils/stakeBetShareId.js'

export type ScriptHouseBetPending = {
  betIndex: number
  at: number
  betApiId?: string
  /** Nur für Debug/Logs. */
  game?: string
}

type HouseBetPayload = {
  shareIid?: string | null
  iid?: string | null
  houseTopId?: string | null
  id?: string | null
  betId?: string | null
}

const PENDING_MAX_AGE_MS = 60000
const PENDING_MAX = 120
const RETRY_BUFFER_MAX_AGE_MS = 45000
const RETRY_BUFFER_MAX = 80

function pickHouseShareIdFromPayload(bItem: HouseBetPayload): string | null {
  const raw = pickStakeHouseBetShareRawId({
    shareIid: bItem.shareIid ?? bItem.iid,
    houseTopId: bItem.houseTopId ?? bItem.id,
  })
  if (!raw) return null
  const formatted = formatStakeShareBetId(raw)
  if (formatted && isPersistableStakeHouseBetShareId(formatted)) {
    return formatted
  }
  return null
}

function providerBetIdFromPayload(bItem: HouseBetPayload): string | null {
  const betId = bItem.betId
  if (betId != null && String(betId).trim() !== '') return String(betId).trim()
  // myBetUpdated: Mutation-ID manchmal nur in Top-Level `id` (numerisch), nicht als house:/casino:
  const topId = bItem.id
  if (topId != null && /^\d+$/.test(String(topId).trim())) return String(topId).trim()
  return null
}

function mergePayload(a: HouseBetPayload, b: HouseBetPayload): HouseBetPayload {
  return {
    shareIid: b.shareIid ?? a.shareIid,
    iid: b.iid ?? a.iid,
    houseTopId: b.houseTopId ?? a.houseTopId,
    id: b.id ?? a.id,
    betId: b.betId ?? a.betId,
  }
}

export type ScriptHouseBetIdBridge = {
  registerPending: (p: ScriptHouseBetPending) => void
  linkBetApiId: (betIndex: number, betApiId: string | undefined | null) => void
  getShareId: (betIndex: number) => string | null
  dispose: () => void
}

export function createScriptHouseBetIdBridge(
  accessToken: string | undefined,
  onResolved?: (betIndex: number, betId: string) => void
): ScriptHouseBetIdBridge {
  const pendingByIndex = new Map<number, ScriptHouseBetPending>()
  const indexByApiId = new Map<string, number>()
  const resolved = new Map<number, string>()
  const eventBufferByApiId = new Map<string, { payload: HouseBetPayload; at: number }>()
  const fifoWaiting: number[] = []
  const fifoHouse: { payload: HouseBetPayload; at: number }[] = []
  let disconnectSub: (() => void) | null = null

  const prune = (now: number) => {
    for (const [idx, p] of pendingByIndex) {
      if (now - p.at > PENDING_MAX_AGE_MS) {
        pendingByIndex.delete(idx)
        if (p.betApiId) indexByApiId.delete(p.betApiId)
      }
    }
    if (pendingByIndex.size > PENDING_MAX) {
      const oldest = [...pendingByIndex.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) {
        pendingByIndex.delete(oldest[0])
        if (oldest[1].betApiId) indexByApiId.delete(oldest[1].betApiId)
      }
    }
    for (const [apiId, item] of eventBufferByApiId) {
      if (now - item.at > RETRY_BUFFER_MAX_AGE_MS) eventBufferByApiId.delete(apiId)
    }
    while (eventBufferByApiId.size > RETRY_BUFFER_MAX) {
      const first = eventBufferByApiId.keys().next().value
      if (first) eventBufferByApiId.delete(first)
    }
    while (fifoWaiting.length > 0) {
      const idx = fifoWaiting[0]
      const p = pendingByIndex.get(idx)
      if (!p || now - p.at > PENDING_MAX_AGE_MS) fifoWaiting.shift()
      else break
    }
    while (fifoHouse.length > 0 && now - fifoHouse[0].at > RETRY_BUFFER_MAX_AGE_MS) {
      fifoHouse.shift()
    }
  }

  const resolveIndex = (betIndex: number, shareId: string) => {
    if (resolved.has(betIndex)) return
    resolved.set(betIndex, shareId)
    const p = pendingByIndex.get(betIndex)
    if (p?.betApiId) indexByApiId.delete(p.betApiId)
    onResolved?.(betIndex, shareId)
  }

  const tryResolveFromBuffer = (betApiId: string) => {
    const buf = eventBufferByApiId.get(betApiId)
    if (!buf) return
    const shareId = pickHouseShareIdFromPayload(buf.payload)
    if (!shareId) return
    const betIndex = indexByApiId.get(betApiId)
    if (betIndex == null) return
    eventBufferByApiId.delete(betApiId)
    resolveIndex(betIndex, shareId)
  }

  const processFifoBacklog = () => {
    while (fifoWaiting.length > 0 && fifoHouse.length > 0) {
      const idx = fifoWaiting[0]
      if (resolved.has(idx)) {
        fifoWaiting.shift()
        continue
      }
      const shareId = pickHouseShareIdFromPayload(fifoHouse[0].payload)
      if (!shareId) break
      fifoWaiting.shift()
      fifoHouse.shift()
      resolveIndex(idx, shareId)
    }
  }

  const retryBufferedWithoutShare = () => {
    for (const [apiId] of eventBufferByApiId) {
      tryResolveFromBuffer(apiId)
    }
  }

  const bufferEvent = (apiId: string, payload: HouseBetPayload) => {
    const existing = eventBufferByApiId.get(apiId)
    eventBufferByApiId.set(apiId, {
      payload: existing ? mergePayload(existing.payload, payload) : payload,
      at: existing?.at ?? Date.now(),
    })
  }

  const tryMatchPayload = (payload: HouseBetPayload) => {
    const apiId = providerBetIdFromPayload(payload)
    const shareId = pickHouseShareIdFromPayload(payload)

    if (apiId) {
      if (shareId) {
        const betIndex = indexByApiId.get(apiId)
        if (betIndex != null) {
          eventBufferByApiId.delete(apiId)
          resolveIndex(betIndex, shareId)
          return
        }
        bufferEvent(apiId, payload)
        return
      }
      bufferEvent(apiId, payload)
      return
    }

    if (shareId) {
      fifoHouse.push({ payload, at: Date.now() })
      processFifoBacklog()
    } else {
      fifoHouse.push({ payload, at: Date.now() })
    }
  }

  const enqueueHouseBet = (payload: HouseBetPayload) => {
    prune(Date.now())
    tryMatchPayload(payload)
    retryBufferedWithoutShare()
    processFifoBacklog()
  }

  if (accessToken?.trim()) {
    void subscribeToHouseBets(accessToken.trim(), (payload: HouseBetPayload) => {
      enqueueHouseBet(payload)
    }).then((sub) => {
      disconnectSub = typeof sub?.disconnect === 'function' ? sub.disconnect : null
    })
  }

  return {
    registerPending(p: ScriptHouseBetPending) {
      prune(Date.now())
      if (resolved.has(p.betIndex)) return
      pendingByIndex.set(p.betIndex, { ...p, at: p.at || Date.now() })
      if (p.betApiId) {
        indexByApiId.set(p.betApiId, p.betIndex)
        tryResolveFromBuffer(p.betApiId)
      } else if (!fifoWaiting.includes(p.betIndex)) {
        fifoWaiting.push(p.betIndex)
      }
      processFifoBacklog()
    },
    linkBetApiId(betIndex: number, betApiId: string | undefined | null) {
      const key = betApiId != null ? String(betApiId).trim() : ''
      if (!key) return
      prune(Date.now())
      const existing = pendingByIndex.get(betIndex)
      if (existing) {
        existing.betApiId = key
      } else {
        pendingByIndex.set(betIndex, { betIndex, at: Date.now(), betApiId: key })
      }
      indexByApiId.set(key, betIndex)
      const fi = fifoWaiting.indexOf(betIndex)
      if (fi >= 0) fifoWaiting.splice(fi, 1)
      tryResolveFromBuffer(key)
    },
    getShareId(betIndex: number) {
      return resolved.get(betIndex) ?? null
    },
    dispose() {
      pendingByIndex.clear()
      indexByApiId.clear()
      eventBufferByApiId.clear()
      fifoWaiting.length = 0
      fifoHouse.length = 0
      resolved.clear()
      try {
        disconnectSub?.()
      } catch {
        /* ignore */
      }
      disconnectSub = null
    },
  }
}

/** Share-ID für Script-Bet-Liste (house:… oder casino:uuid). */
export function isScriptDisplayableBetShareId(id: string | null | undefined): boolean {
  if (!id) return false
  return isPersistableStakeHouseBetShareId(String(id).trim())
}
