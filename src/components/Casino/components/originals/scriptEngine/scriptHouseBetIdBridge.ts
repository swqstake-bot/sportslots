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
  /** Tatsächlicher API-Einsatz (Major). */
  amountMajor: number
  /** Gesendeter Betrag — Fallback für houseBets-Match. */
  amountSentMajor?: number
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
const HOUSEBET_BUFFER_MAX = 48
const HOUSEBET_BUFFER_MAX_AGE_MS = 30000

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

function amountMajorMatches(pendingMajor: number, bItem: HouseBetPayload): boolean {
  const hb = Number(bItem.amountMajor ?? bItem.amount)
  const p = Number(pendingMajor)
  if (!Number.isFinite(hb) || hb <= 0 || !Number.isFinite(p) || p <= 0) return false
  const rel = Math.abs(p - hb) / Math.max(hb, p, 1e-12)
  return rel <= 0.05 || Math.abs(p - hb) <= 1e-6
}

function pendingAmountMatches(p: ScriptHouseBetPending, bItem: HouseBetPayload): boolean {
  const candidates = [p.amountMajor, p.amountSentMajor].filter(
    (n) => Number.isFinite(Number(n)) && Number(n) > 0
  ) as number[]
  return candidates.some((c) => amountMajorMatches(c, bItem))
}

function multiMatches(pendingMulti: number, bItem: HouseBetPayload): boolean {
  const hm = Number(bItem.payoutMultiplier)
  const pm = Number(pendingMulti)
  if (!Number.isFinite(pm) || pm < 0) return true
  if (!Number.isFinite(hm) || hm < 0) return true
  if (hm < 1e-8 && pm < 1e-8) return true
  const rel = Math.abs(pm - hm) / Math.max(pm, hm, 1e-9)
  return rel <= 0.08 || Math.abs(pm - hm) <= 0.2
}

function pendingMatchesHouseBet(p: ScriptHouseBetPending, bItem: HouseBetPayload, strictMulti: boolean): boolean {
  const payloadCurr = String(bItem.currency || '').toLowerCase()
  if (!scriptGameMatchesHouseBet(p.game, bItem)) return false
  if (!hunterBetCurrenciesMatch(p.currency, payloadCurr)) return false
  if (!pendingAmountMatches(p, bItem)) return false
  if (strictMulti && !multiMatches(p.payoutMultiplier, bItem)) return false
  return true
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
  const houseBetBuffer: { bItem: HouseBetPayload; at: number }[] = []
  let disconnectSub: (() => void) | null = null

  const prune = (now: number) => {
    while (pending.length > 0 && now - pending[0].at > PENDING_MAX_AGE_MS) {
      pending.shift()
    }
    while (pending.length > PENDING_MAX) pending.shift()
    while (houseBetBuffer.length > 0 && now - houseBetBuffer[0].at > HOUSEBET_BUFFER_MAX_AGE_MS) {
      houseBetBuffer.shift()
    }
    while (houseBetBuffer.length > HOUSEBET_BUFFER_MAX) houseBetBuffer.shift()
  }

  const resolvePending = (p: ScriptHouseBetPending, shareId: string) => {
    if (resolved.has(p.betIndex)) return
    resolved.set(p.betIndex, shareId)
    const idx = pending.findIndex((x) => x.betIndex === p.betIndex)
    if (idx >= 0) pending.splice(idx, 1)
    onResolved?.(p.betIndex, shareId)
  }

  const tryMatchPending = (p: ScriptHouseBetPending, bItem: HouseBetPayload): boolean => {
    const shareId = pickHouseShareIdFromPayload(bItem)
    if (!shareId) return false
    if (resolved.has(p.betIndex)) return true

    const loose = pendingMatchesHouseBet(p, bItem, false)
    if (!loose) return false

    const strictCandidates = pending.filter(
      (cand) =>
        !resolved.has(cand.betIndex) &&
        pendingMatchesHouseBet(cand, bItem, false) &&
        multiMatches(cand.payoutMultiplier, bItem)
    )
    if (strictCandidates.length === 1 && strictCandidates[0].betIndex === p.betIndex) {
      resolvePending(p, shareId)
      return true
    }
    if (strictCandidates.length > 1) return false

    const looseCandidates = pending.filter(
      (cand) => !resolved.has(cand.betIndex) && pendingMatchesHouseBet(cand, bItem, false)
    )
    if (looseCandidates.length === 1 && looseCandidates[0].betIndex === p.betIndex) {
      resolvePending(p, shareId)
      return true
    }
    return false
  }

  const tryMatchHouseBet = (bItem: HouseBetPayload) => {
    const shareId = pickHouseShareIdFromPayload(bItem)
    if (!shareId) return

    for (let i = pending.length - 1; i >= 0; i--) {
      if (tryMatchPending(pending[i], bItem)) return
    }

    prune(Date.now())
    houseBetBuffer.push({ bItem, at: Date.now() })
  }

  const flushBufferForPending = (p: ScriptHouseBetPending) => {
    if (resolved.has(p.betIndex)) return
    const keep: typeof houseBetBuffer = []
    for (const entry of houseBetBuffer) {
      if (tryMatchPending(p, entry.bItem)) {
        continue
      }
      keep.push(entry)
    }
    houseBetBuffer.length = 0
    houseBetBuffer.push(...keep)
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
      if (resolved.has(p.betIndex)) return
      const idx = pending.findIndex((x) => x.betIndex === p.betIndex)
      if (idx >= 0) pending[idx] = p
      else pending.push(p)
      flushBufferForPending(p)
    },
    getShareId(betIndex: number) {
      return resolved.get(betIndex) ?? null
    },
    dispose() {
      pending.length = 0
      houseBetBuffer.length = 0
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
