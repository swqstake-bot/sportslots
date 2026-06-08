/**
 * Script-Mode: Share-IDs aus houseBets (house:460…) — nicht aus Bet-Mutation (casino:uuid).
 */

import { subscribeToHouseBets } from '../../../api/stakeRealtimeFacade'
import {
  formatStakeShareBetId,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
} from '../../../utils/stakeBetShareId.js'
import { hunterBetCurrenciesMatch } from '../../../utils/currencyMeta'

export type ScriptHouseBetPending = {
  betIndex: number
  at: number
  currency: string
  amountMajor: number
  game: string
  payoutMultiplier: number
}

type HouseBetPayload = {
  shareIid?: string | null
  iid?: string | null
  houseTopId?: string | null
  id?: string | null
  betId?: string | null
  amount?: number | null
  amountMajor?: number | null
  currency?: string
  payoutMultiplier?: number | null
  gameSlug?: string
  gameName?: string | null
}

const PENDING_MAX_AGE_MS = 45000
const PENDING_MAX = 80

function pickHouseShareIdFromPayload(bItem: HouseBetPayload): string | null {
  const raw = pickStakeHouseBetShareRawId({
    shareIid: bItem.shareIid ?? bItem.iid,
    houseTopId: bItem.houseTopId ?? bItem.id,
  })
  if (!raw) return null
  const formatted = formatStakeShareBetId(raw)
  if (formatted && isPersistableStakeHouseBetShareId(formatted) && /^house:\d+/i.test(formatted)) {
    return formatted
  }
  return null
}

function scriptGameMatchesHouseBet(game: string, bItem: HouseBetPayload): boolean {
  const g = String(game || '').toLowerCase()
  const slug = String(bItem.gameSlug || '').toLowerCase()
  const name = String(bItem.gameName || '').toLowerCase()
  if (!g) return true
  if (g === 'keno') return slug.includes('keno') || name.includes('keno')
  if (g === 'dice') return slug.includes('dice') || name === 'dice'
  if (g === 'limbo') return slug.includes('limbo') || name.includes('limbo')
  if (g === 'plinko') return slug.includes('plinko') || name.includes('plinko')
  if (g === 'mines') return slug.includes('mines') || name.includes('mine')
  return slug.includes(g) || name.includes(g)
}

function amountMatches(pendingMajor: number, bItem: HouseBetPayload): boolean {
  const hb = Number(bItem.amountMajor ?? bItem.amount)
  const p = Number(pendingMajor)
  if (!Number.isFinite(hb) || hb <= 0 || !Number.isFinite(p) || p <= 0) return false
  const rel = Math.abs(p - hb) / Math.max(hb, p, 1e-12)
  return rel <= 0.04 || Math.abs(p - hb) <= 1e-8
}

function multiMatches(pendingMulti: number, bItem: HouseBetPayload): boolean {
  const hm = Number(bItem.payoutMultiplier)
  const pm = Number(pendingMulti)
  if (!Number.isFinite(pm) || pm < 0) return true
  if (!Number.isFinite(hm) || hm < 0) return true
  if (hm < 1e-8 && pm < 1e-8) return true
  const rel = Math.abs(pm - hm) / Math.max(pm, hm, 1e-9)
  return rel <= 0.06 || Math.abs(pm - hm) <= 0.15
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
  const pending: ScriptHouseBetPending[] = []
  const resolved = new Map<number, string>()
  let disconnectSub: (() => void) | null = null

  const prune = (now: number) => {
    while (pending.length > 0 && now - pending[0].at > PENDING_MAX_AGE_MS) {
      pending.shift()
    }
    while (pending.length > PENDING_MAX) pending.shift()
  }

  const tryMatchHouseBet = (bItem: HouseBetPayload) => {
    const shareId = pickHouseShareIdFromPayload(bItem)
    if (!shareId) return
    const payloadCurr = String(bItem.currency || '').toLowerCase()

    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]
      if (resolved.has(p.betIndex)) continue
      if (!scriptGameMatchesHouseBet(p.game, bItem)) continue
      if (!hunterBetCurrenciesMatch(p.currency, payloadCurr)) continue
      if (!amountMatches(p.amountMajor, bItem)) continue
      if (!multiMatches(p.payoutMultiplier, bItem)) continue

      resolved.set(p.betIndex, shareId)
      pending.splice(i, 1)
      onResolved?.(p.betIndex, shareId)
      return
    }
  }

  if (accessToken?.trim()) {
    void subscribeToHouseBets(accessToken.trim(), (payload: HouseBetPayload) => {
      tryMatchHouseBet(payload)
    }).then((sub) => {
      disconnectSub = typeof sub?.disconnect === 'function' ? sub.disconnect : null
    })
  }

  return {
    registerPending(p: ScriptHouseBetPending) {
      prune(Date.now())
      if (!resolved.has(p.betIndex)) pending.push(p)
    },
    getShareId(betIndex: number) {
      return resolved.get(betIndex) ?? null
    },
    dispose() {
      pending.length = 0
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
