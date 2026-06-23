/**
 * Script-Mode: Share-IDs aus houseBets (house:460… / casino:uuid).
 * Einfaches FIFO — der Stream enthält nur eigene Wetten, Reihenfolge = Platzierungsreihenfolge.
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
  /** Nur für Debug/Logs — Matching nutzt FIFO. */
  game?: string
}

type HouseBetPayload = {
  shareIid?: string | null
  iid?: string | null
  houseTopId?: string | null
  id?: string | null
}

const PENDING_MAX_AGE_MS = 60000
const PENDING_MAX = 120
const HOUSEBET_BUFFER_MAX = 120
const HOUSEBET_BUFFER_MAX_AGE_MS = 60000

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

export type ScriptHouseBetIdBridge = {
  registerPending: (p: ScriptHouseBetPending) => void
  getShareId: (betIndex: number) => string | null
  dispose: () => void
}

export function createScriptHouseBetIdBridge(
  accessToken: string | undefined,
  onResolved?: (betIndex: number, betId: string) => void
): ScriptHouseBetIdBridge {
  /** Älteste zuerst — je houseBet-Event wird die nächste offene Zeile gematcht. */
  const pendingFifo: ScriptHouseBetPending[] = []
  const houseFifo: { bItem: HouseBetPayload; at: number }[] = []
  const resolved = new Map<number, string>()
  let disconnectSub: (() => void) | null = null

  const prune = (now: number) => {
    while (pendingFifo.length > 0 && now - pendingFifo[0].at > PENDING_MAX_AGE_MS) {
      pendingFifo.shift()
    }
    while (pendingFifo.length > PENDING_MAX) pendingFifo.shift()
    while (houseFifo.length > 0 && now - houseFifo[0].at > HOUSEBET_BUFFER_MAX_AGE_MS) {
      houseFifo.shift()
    }
    while (houseFifo.length > HOUSEBET_BUFFER_MAX) houseFifo.shift()
  }

  const tryPairFifo = () => {
    while (pendingFifo.length > 0 && houseFifo.length > 0) {
      const p = pendingFifo[0]
      if (resolved.has(p.betIndex)) {
        pendingFifo.shift()
        continue
      }
      const shareId = pickHouseShareIdFromPayload(houseFifo[0].bItem)
      if (!shareId) {
        houseFifo.shift()
        continue
      }
      pendingFifo.shift()
      houseFifo.shift()
      resolved.set(p.betIndex, shareId)
      onResolved?.(p.betIndex, shareId)
    }
  }

  const enqueueHouseBet = (bItem: HouseBetPayload) => {
    prune(Date.now())
    houseFifo.push({ bItem, at: Date.now() })
    tryPairFifo()
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
      const idx = pendingFifo.findIndex((x) => x.betIndex === p.betIndex)
      if (idx >= 0) pendingFifo[idx] = p
      else pendingFifo.push(p)
      tryPairFifo()
    },
    getShareId(betIndex: number) {
      return resolved.get(betIndex) ?? null
    },
    dispose() {
      pendingFifo.length = 0
      houseFifo.length = 0
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
