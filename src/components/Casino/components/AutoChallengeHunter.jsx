import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react'
import { fetchChallengeList, fetchCurrencyRates, extractProviderGroupSlug } from '../api/stakeChallenges'
import { getProvider } from '../api/providers'
import { isFiat, isStable, formatAmount, formatBetLabel, toUnits, toMinor, ZERO_DECIMAL_CURRENCIES } from '../utils/formatAmount'
import { parseBetResponse } from '../utils/parseBetResponse'
import { Button } from './ui/Button'
import { CURRENCY_GROUPS, PROVIDER_CURRENCIES } from '../constants/currencies'
import { notifyChallengeStart, requestNotificationPermission } from '../utils/notifications'
import { addDiscoveredFromChallenges, inferProviderId } from '../utils/discoveredSlots'
import {
  effectiveSpinMultiplierFromParsed,
  skipStakeEngineEndRoundAfterSuccessfulPlay,
} from '../api/providers/stakeEngine'
import { ProfitCircularBuffer } from '../utils/profitCircularBuffer'
import {
  queueHunterBetHistory,
  flushHunterBetHistory,
  clearHunterBetHistoryBuffer,
} from '../utils/hunterBetHistoryBuffer'
import {
  formatStakeShareBetId,
  areStakeShareIdsEquivalent,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
  stakeBetIdForPreviewApi,
  stakeBetModalShareUrl,
} from '../utils/stakeBetShareId'
import { normalizeBetSlugForHouseMatch, houseBetSlugMatchesSessionSlug } from '../utils/slotSlugMatching'
import { setHunterSlotTargets } from '../utils/hunterSlotTargetsBridge'
import { subscribeToHouseBets } from '../api/stakeRealtimeFacade'
import {
  usdLimitToInputStr,
  parseUsdLimitInput,
  isUsdLimitInputCharsOk,
} from '../utils/usdLimitInput'
import { saveFirstSlotWinIfNeeded } from '../utils/slotFirstWin'
import { getHunterState, saveHunterState, clearHunterState } from '../utils/challengeCompletion'
import { getChallengeHubRecentBets, publishChallengeHubBet } from '../utils/challengeHubLiveFeed'
import {
  clearPendingHouseBetsForRun,
  patchHubFeedEntryFromHouseBet,
  patchHubFeedRunFromHouseBet,
  patchHubFeedRunShareId,
} from '../utils/challengeHubBetIdPatch'
import { buildUsdSpinDelta } from '../utils/casinoStatsEngine'
import { buildStakeCasinoFairnessReferer, rotateStakeRgsGameSeed } from '../api/stakeFairness'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import { TipMenu } from '../../ui/TipMenu'
import { useChallengeHubRecentBets } from './challengeHub/ChallengeHubBetListContext'
import { SvgCumulativeProfitLineChart } from '../../charts/SvgCumulativeCharts'

/** Challenge-Liste: alle Einträge wie von Stake; Provider aus Slug/WebSlots (`inferProviderId`), nicht blind stakeEngine. */

function resolveHunterProviderId(slug, challengeGame) {
  const fromChallenge = String(challengeGame?.providerId || '').toLowerCase()
  if (fromChallenge && fromChallenge !== 'stakeengine') return fromChallenge
  return inferProviderId(String(slug || ''))
}

const REFRESH_INTERVAL_MS = 2 * 60 * 1000 // 2 Minuten
/** DevTools: [Hunter-BetID] — nur bei Bedarf auf true (sonst volle Konsole). */
const DEBUG_HUNTER_BETID_MATCH = false
/** Chrome/F12-Konsole: Best-Multi + Bet-ID als `console.table` bei Änderung (zum Prüfen von Share-IDs). */
const LOG_HUNTER_BEST_TO_CONSOLE = false
/** Pending-Einträge älter: aus Queue entfernen (sonst wächst sie endlos, Matching wird langsam). */
const PENDING_HOUSEBET_MAX_AGE_MS = 35000
/** houseBets oft vor HTTP-Response — bis Pending mit Multi da ist, Events kurz puffern. */
const HOUSEBET_RETRY_BUFFER_MAX_MS = 25000
const HOUSEBET_RETRY_BUFFER_MAX = 40
/** Wenn houseBets nie matcht: Best-Multi-UI trotzdem aus HTTP (sonst hängt die Anzeige). */
const HOUSEBET_DEFERRED_UI_MULTI_MS = 5000
/** Dedup-Set pro Run: ohne Obergrenze wächst der Speicher bei 200k+ Spins linear → UI/GC-Probleme. */
const HUNTER_SEEN_ROUND_DEDUP_MAX = 8000
const PROFIT_CHART_CAPACITY = 1000
const HOUSEBET_EVENT_QUEUE_MAX = 500
const HUNTER_ACTIVE_RUNS_UI_FLUSH_MS = 400
const HUNTER_ACTIVE_RUNS_UI_FLUSH_EVERY_SPINS = 6
/** Nach neuem Run-Rekord-Multi: Logger kurz prüfen und `bestBetId` bei ID-Mismatch korrigieren. */
const LOGGER_BET_ID_RECONCILE_DELAY_MS = 1000
const LOGGER_BET_ID_RECONCILE_ROW_LIMIT = 600
const PAGE_SIZE = 20 // sichere Challenge-Page-Size (Stake number_less_equal Schutz)
/** UI-Obergrenze für parallele Läufe & Anzahl Challenge-Listen-Seiten (Slider). */
const CHALLENGE_SLIDER_MAX = 100

function normalizeHunterMultiByProvider(rawMulti, providerId) {
  const m = Number(rawMulti)
  if (!Number.isFinite(m) || m <= 0) return 0
  const pid = String(providerId || '').toLowerCase()
  // Mascot/Hub88 reports multiplier values scaled by 1000 (e.g. 50 => 0.05x, 1600 => 1.6x).
  if (pid === 'mascot' || pid === 'hub88') {
    return m / 1000
  }
  return m
}

/**
 * Pending-HouseBet-Matching: pro runId eigene Liste (parallele Kopien teilen keine globale FIFO).
 * Bei mehreren passenden Einträgen gewinnt der älteste `at` (zuerst fertiggestellter Spin).
 */
function prunePendingHouseBetMap(pendingMap, now) {
  if (!pendingMap || typeof pendingMap !== 'object') return
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) {
      delete pendingMap[runId]
      continue
    }
    while (q.length > 0 && now - q[0].at > PENDING_HOUSEBET_MAX_AGE_MS) {
      q.shift()
    }
    if (q.length === 0) delete pendingMap[runId]
  }
}

/**
 * Parallele Runs gleicher Slot+Währung: nicht global „ältestes Pending“ — sonst falsche house:iid am Run.
 * Abgleich über Einsatz (major, wie houseBets) + Multi (HTTP vs WS), mit Fallbacks.
 */
function houseBetStakeMajorMatchesPending(pendingMajor, bItem) {
  const hb = Number(bItem?.amountMajor ?? bItem?.amount)
  const p = Number(pendingMajor)
  if (!Number.isFinite(hb) || hb <= 0) return false
  if (!Number.isFinite(p) || p <= 0) return false
  const rel = Math.abs(p - hb) / Math.max(hb, p, 1e-12)
  return rel <= 0.03 || Math.abs(p - hb) <= 1e-9
}

function houseBetPayoutMultiplierMatchesPending(pendingMulti, bItem) {
  const hm = Number(bItem?.payoutMultiplier)
  const pm = Number(pendingMulti)
  if (!Number.isFinite(pm) || pm < 0) return false
  if (!Number.isFinite(hm) || hm < 0) return false
  if (hm < 1e-8 && pm < 1e-8) return true
  const rel = Math.abs(pm - hm) / Math.max(pm, hm, 1e-9)
  return rel <= 0.05 || Math.abs(pm - hm) <= 0.1
}

function collectPendingHouseBetCandidates(pendingMap, payloadSlug, payloadCurr, currencyStrict) {
  const out = []
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) continue
    for (let i = 0; i < q.length; i++) {
      const p = q[i]
      if (p == null || p.multi == null) continue
      if (!houseBetSlugMatchesSessionSlug(payloadSlug, p.slug)) continue
      if (currencyStrict) {
        if (!payloadCurr || String(p.currency || '').toLowerCase() !== String(payloadCurr).toLowerCase()) {
          continue
        }
      }
      out.push({ runId, idx: i, p, at: Number(p.at) || 0 })
    }
  }
  return out
}

function pickOldestPendingEntry(entries) {
  if (!entries.length) return null
  return entries.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    return String(a.runId).localeCompare(String(b.runId))
  })[0]
}

function houseBetReceivedMs(bItem) {
  const t = Date.parse(String(bItem?.receivedAt || ''))
  return Number.isFinite(t) ? t : null
}

/** Bei mehreren gleich guten Matches: Pending-Zeit (HTTP) nahe WS-`receivedAt` statt nur FIFO — weniger Vertauschung bei parallelen Runs. */
function pickPendingClosestToHouseBetTime(entries, bItem) {
  if (!entries.length) return null
  if (entries.length === 1) return entries[0]
  const evtMs = houseBetReceivedMs(bItem)
  if (evtMs == null) return pickOldestPendingEntry(entries)
  let best = entries[0]
  let bestDist = Math.abs((best.at || 0) - evtMs)
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]
    const d = Math.abs((e.at || 0) - evtMs)
    if (d < bestDist) {
      best = e
      bestDist = d
    } else if (d === bestDist) {
      if (e.at < best.at || (e.at === best.at && String(e.runId) < String(best.runId))) best = e
    }
  }
  return best
}

function selectPendingEntryForHouseBet(candidates, bItem) {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  const hbMult = Number(bItem?.payoutMultiplier)
  const hasHbMult = Number.isFinite(hbMult) && hbMult >= 0

  const byAmount = candidates.filter(({ p }) => houseBetStakeMajorMatchesPending(p.betAmountMajor, bItem))

  if (byAmount.length === 1) return byAmount[0]

  if (byAmount.length > 1 && hasHbMult) {
    const byAmtMult = byAmount.filter(({ p }) => houseBetPayoutMultiplierMatchesPending(p.multi, bItem))
    if (byAmtMult.length === 1) return byAmtMult[0]
    if (byAmtMult.length > 1) return pickPendingClosestToHouseBetTime(byAmtMult, bItem)
    const scored = byAmount
      .map((c) => ({ c, dist: Math.abs(Number(c.p.multi) - hbMult) }))
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist
        if (a.c.at !== b.c.at) return a.c.at - b.c.at
        return String(a.c.runId).localeCompare(String(b.c.runId))
      })
    return scored[0].c
  }

  if (byAmount.length > 1 && !hasHbMult) {
    return pickOldestPendingEntry(byAmount)
  }

  if (byAmount.length === 0) {
    if (hasHbMult) {
      const byMult = candidates.filter(({ p }) => houseBetPayoutMultiplierMatchesPending(p.multi, bItem))
      if (byMult.length === 1) return byMult[0]
      if (byMult.length > 1) return pickPendingClosestToHouseBetTime(byMult, bItem)
    }
  }

  return null
}

function splicePendingHouseBetMatch(pendingMap, payloadSlug, payloadCurr, bItem) {
  if (!pendingMap || typeof pendingMap !== 'object' || bItem == null) return null
  const trySplice = (currencyStrict) => {
    const candidates = collectPendingHouseBetCandidates(pendingMap, payloadSlug, payloadCurr, currencyStrict)
    const chosen = selectPendingEntryForHouseBet(candidates, bItem)
    if (!chosen) return null
    const q = pendingMap[chosen.runId]
    if (!Array.isArray(q) || chosen.idx < 0 || chosen.idx >= q.length) return null
    const [removed] = q.splice(chosen.idx, 1)
    if (q.length === 0) delete pendingMap[chosen.runId]
    return removed
  }
  if (payloadCurr) {
    const strict = trySplice(true)
    if (strict) return strict
    return trySplice(false)
  }
  return trySplice(false)
}

function splicePendingHouseBetByProviderBetId(pendingMap, payloadSlug, providerBetId) {
  const wanted = String(providerBetId || '').trim()
  if (!wanted || !pendingMap || typeof pendingMap !== 'object') return null
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q) || q.length === 0) continue
    for (let i = 0; i < q.length; i++) {
      const p = q[i]
      const pBetId = String(p?.providerBetId || '').trim()
      if (!pBetId || pBetId !== wanted) continue
      const pSlug = String(p?.slug || '').trim()
      if (payloadSlug && pSlug && !houseBetSlugMatchesSessionSlug(payloadSlug, pSlug)) continue
      const [removed] = q.splice(i, 1)
      if (q.length === 0) delete pendingMap[runId]
      return removed
    }
  }
  return null
}

function splicePendingHouseBetMatchWithoutSlug(pendingMap, payloadCurr, bItem) {
  if (!pendingMap || typeof pendingMap !== 'object' || bItem == null) return null
  const trySplice = (currencyStrict) => {
    const candidates = []
    for (const runId of Object.keys(pendingMap)) {
      const q = pendingMap[runId]
      if (!Array.isArray(q)) continue
      for (let i = 0; i < q.length; i++) {
        const p = q[i]
        if (p == null || p.multi == null) continue
        if (currencyStrict) {
          if (!payloadCurr || String(p.currency || '').toLowerCase() !== String(payloadCurr).toLowerCase()) {
            continue
          }
        }
        candidates.push({ runId, idx: i, p, at: Number(p.at) || 0 })
      }
    }
    const chosen = selectPendingEntryForHouseBet(candidates, bItem)
    if (!chosen) return null
    const q = pendingMap[chosen.runId]
    if (!Array.isArray(q) || chosen.idx < 0 || chosen.idx >= q.length) return null
    const [removed] = q.splice(chosen.idx, 1)
    if (q.length === 0) delete pendingMap[chosen.runId]
    return removed
  }
  if (payloadCurr) {
    const strict = trySplice(true)
    if (strict) return strict
    return trySplice(false)
  }
  return trySplice(false)
}

function trimPendingQueues(pendingMap, maxPerRun) {
  const cap = maxPerRun ?? 80
  if (!pendingMap || typeof pendingMap !== 'object') return
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) continue
    while (q.length > cap) q.shift()
    if (q.length === 0) delete pendingMap[runId]
  }
}

function hasPendingHouseBetForPayloadSlug(pendingMap, payloadSlug) {
  if (payloadSlug == null || String(payloadSlug).trim() === '') return false
  if (!pendingMap || typeof pendingMap !== 'object') return false
  const ps = String(payloadSlug).toLowerCase()
  for (const rid of Object.keys(pendingMap)) {
    const q = pendingMap[rid]
    if (!Array.isArray(q)) continue
    for (const p of q) {
      const s = normalizeBetSlugForHouseMatch(p?.slug)
      if (s && houseBetSlugMatchesSessionSlug(ps, s)) return true
    }
  }
  return false
}

function pickLoggerRowHouseShareRaw(row) {
  if (!row || typeof row !== 'object') return null
  return pickStakeHouseBetShareRawId({
    shareIid: row.iid,
    houseTopId: row.houseId,
    id: row.betId,
  })
}

function getLoggerRowPayoutMultiplier(row) {
  const pm = Number(row?.payoutMultiplier)
  if (Number.isFinite(pm) && pm > 0) return pm
  const amt = Number(row?.amount)
  const pay = Number(row?.payout)
  if (Number.isFinite(amt) && amt > 0 && Number.isFinite(pay) && pay > 0) return pay / amt
  return 0
}

function loggerMultiMatchesRunMulti(rowMulti, runMulti) {
  const t = Number(runMulti) || 0
  const m = Number(rowMulti) || 0
  if (t <= 0 || m <= 0) return false
  if (Math.abs(m - t) <= 0.051) return true
  const rel = Math.abs(m - t) / t
  return rel <= 0.025
}

function findLoggerRowForHunterBestMulti(rows, run, targetMulti, minTs, runBetMajor = null) {
  const runSlugNorm = normalizeBetSlugForHouseMatch(run?.slotSlug || '')
  const runCurr = String(run?.runCurrency || '').trim().toLowerCase()
  const stakeMajor = Number(runBetMajor)
  const useStakeFilter = Number.isFinite(stakeMajor) && stakeMajor > 0
  const scored = []
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue
    if (String(row?.category || 'casino').toLowerCase() === 'sports') continue
    const rowSlug = normalizeBetSlugForHouseMatch(row?.gameSlug || '')
    if (!houseBetSlugMatchesSessionSlug(rowSlug, runSlugNorm)) continue
    if (runCurr) {
      const rc = String(row?.currency || '').trim().toLowerCase()
      if (rc && rc !== runCurr) continue
    }
    if (useStakeFilter) {
      const ram = Number(row?.amount)
      if (!Number.isFinite(ram) || ram <= 0) continue
      const rel = Math.abs(ram - stakeMajor) / Math.max(ram, stakeMajor, 1e-12)
      if (rel > 0.04 && Math.abs(ram - stakeMajor) > 1e-8) continue
    }
    const ts = Date.parse(String(row?.receivedAt || row?.createdAt || row?.timestamp || ''))
    const tsN = Number.isFinite(ts) ? ts : 0
    if (minTs > 0 && tsN > 0 && tsN < minTs) continue
    const m = getLoggerRowPayoutMultiplier(row)
    if (!loggerMultiMatchesRunMulti(m, targetMulti)) continue
    scored.push({ row, ts: tsN })
  }
  scored.sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return scored[0]?.row ?? null
}

const HUNTER_TARGET_CANDIDATES = [
  ...CURRENCY_GROUPS.fiat.map((c) => c.value),
  ...CURRENCY_GROUPS.crypto.map((c) => c.value),
]

function generateHunterRunId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/** Queue-Eintrag: eindeutiger Run + Challenge-ID + Index für die N-te Zielwährung (0 = günstigster Auto-Probe wie bisher). optional forcedTargetCurrency = manuelle Zielwährung (überschreibt Auto). */
function normalizeQueueItem(raw) {
  if (raw && typeof raw === 'object' && raw.runId && raw.challengeId) {
    const idx = Number(raw.currencySlotIndex)
    const f = raw.forcedTargetCurrency
    const src = raw.sourceCurrency
    const slug = raw.slotSlug
    const seedRaw = Number(raw.stakeRgsSeedResetEvery)
    const stakeRgsSeedResetEvery =
      Number.isFinite(seedRaw) && seedRaw >= 0
        ? Math.min(100000, Math.floor(seedRaw))
        : 0
    return {
      runId: String(raw.runId),
      challengeId: String(raw.challengeId),
      currencySlotIndex: Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0,
      forcedTargetCurrency:
        f != null && String(f).trim() !== '' ? String(f).trim().toLowerCase() : null,
      sourceCurrency:
        src != null && String(src).trim() !== '' ? String(src).trim().toLowerCase() : null,
      slotSlug: slug != null && String(slug).trim() !== '' ? String(slug).trim().toLowerCase() : null,
      stakeRgsSeedResetEvery,
    }
  }
  const cid = typeof raw === 'string' ? raw : raw?.challengeId
  return {
    runId: generateHunterRunId(),
    challengeId: String(cid),
    currencySlotIndex: 0,
    forcedTargetCurrency: null,
    sourceCurrency: null,
    slotSlug: null,
    stakeRgsSeedResetEvery: 0,
  }
}

function buildProbeCacheKey(providerId, slotSlug, sourceCurr, minBetUsd) {
  const pid = String(providerId || 'stakeengine').toLowerCase()
  const slug = String(slotSlug || '').toLowerCase()
  const src = String(sourceCurr || '').toLowerCase()
  const min = Number(minBetUsd || 0)
  return `${pid}|${slug}|${src}|${Number.isFinite(min) ? min.toFixed(6) : '0.000000'}`
}

function getRateForCurrency(rates, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (c === 'usd' || c === 'usdc' || c === 'usdt') return 1
  return rates[c] || 0
}

/**
 * Netto-Statistik pro Spin in USD (gleiche Spur wie challengeHub Bet-Liste).
 * houseBets bleibt für Share-IDs / Anreicherung, nicht doppelt in`s KPI zählen.
 */
function hunterSpinKpiUsdDeltas(betMinor, winMinor, tCurr, rates) {
  return buildUsdSpinDelta(betMinor, winMinor ?? 0, tCurr || 'usd', rates || {})
}

/** Ohne Flag: ältere Zeilen gelten als settled (DB / vor Migration). */
function hubRowSettlementPending(row) {
  return row && typeof row === 'object' && row.hubSettlement === 'pending'
}

/** Win/Bet aus Challenge-Hub-BetList (gleiche Einheiten, z. B. USD-Cent). */
function hubBetListRowMultiplier(row) {
  if (hubRowSettlementPending(row)) return 0
  const bet = Number(row?.betAmount) || 0
  const win = Number(row?.winAmount) || 0
  if (bet <= 0) return 0
  return win / bet
}

/** Zeilen mit id `${runId}:…` — gleiche Zuordnung wie publishChallengeHubBet. */
function hunterHubListMaxForRun(bets, runId) {
  const rid = String(runId || '')
  if (!bets?.length || !rid) return { max: 0, has: false }
  const prefix = `${rid}:`
  let m = 0
  let has = false
  for (const b of bets) {
    const id = String(b?.id ?? '')
    if (!id.startsWith(prefix)) continue
    has = true
    m = Math.max(m, hubBetListRowMultiplier(b))
  }
  return { max: m, has }
}

function hunterHubListMaxForSlot(bets, slotSlug) {
  const slug = String(slotSlug || '').toLowerCase()
  if (!bets?.length || !slug) return { max: 0, has: false }
  let m = 0
  let has = false
  for (const b of bets) {
    const s = String(b?.slotSlug ?? '').toLowerCase()
    if (s !== slug) continue
    has = true
    m = Math.max(m, hubBetListRowMultiplier(b))
  }
  return { max: m, has }
}

/** Wie BetList: Share-Roh-ID aus der Zeile mit höchstem Multi (gleicher Run wie `${runId}:…`). */
function hubPickShareRawFromBetList(bets, runId) {
  const p = `${String(runId)}:`
  let bestRaw = null
  let bestM = -1
  let fallbackPendingRaw = null
  for (const b of bets || []) {
    if (!String(b?.id ?? '').startsWith(p)) continue
    const raw = b.shareIid || b.houseTopId || b.houseId || b.iid
    if (raw == null || String(raw).trim() === '') continue
    if (hubRowSettlementPending(b)) {
      if (fallbackPendingRaw == null) fallbackPendingRaw = raw
      continue
    }
    const m = hubBetListRowMultiplier(b)
    if (m > bestM) {
      bestM = m
      bestRaw = raw
    }
  }
  return bestRaw ?? fallbackPendingRaw
}

/** Minor units → USD (wie im Spin-Loop: toUnits * Kurs) */
function minorToUsd(amountMinor, currency, rates) {
  if (amountMinor == null || currency == null) return 0
  const n = Number(amountMinor)
  if (!Number.isFinite(n)) return 0
  const c = String(currency).toLowerCase()
  const r = getRateForCurrency(rates, c)
  if (!r) return 0
  return toUnits(n, c) * r
}

/** Effektiver USD-Wert nach gleicher Rundung wie beim Hunter-Lauf (ceil + toMinor). */
function effectiveUsdAfterRounding(minBetUsd, rate, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (!rate || rate <= 0) return null
  let targetBetUnits = minBetUsd / rate
  if (ZERO_DECIMAL_CURRENCIES.includes(c)) {
    targetBetUnits = Math.ceil(targetBetUnits)
  } else if (isFiat(c)) {
    targetBetUnits = Math.ceil(targetBetUnits * 100) / 100
  } else {
    targetBetUnits = Math.ceil(targetBetUnits * 1e8) / 1e8
  }
  const minor = toMinor(targetBetUnits, c)
  return toUnits(minor, c) * rate
}

/**
 * Bei fast gleichem effektivem USD: Reihenfolge für Probes (niedrig = früher).
 * PKR/INR/… vor ARS/CLP/… — sonst schlägt oft Alphabet (ars vor pkr) bzw. zu wenige Proben.
 */
const FIAT_PROBE_PRIORITY = new Map([
  ['pkr', 0],
  ['inr', 1],
  ['idr', 2],
  ['php', 3],
  ['vnd', 4],
  ['krw', 5],
  ['jpy', 6],
  ['cny', 7],
  ['rub', 8],
  ['try', 9],
  ['pln', 10],
  ['ngn', 11],
  ['eur', 20],
  ['usd', 21],
  ['cad', 22],
  ['aud', 23],
  ['dkk', 24],
  ['ars', 50],
  ['mxn', 51],
  ['clp', 52],
  ['pen', 53],
  ['brl', 54],
  ['cop', 55],
])

function fiatProbeRank(tCurr) {
  const k = String(tCurr || '').toLowerCase()
  return FIAT_PROBE_PRIORITY.has(k) ? FIAT_PROBE_PRIORITY.get(k) : 100
}

const USD_EFF_TIE_EPS = 0.015

/**
 * PKR vs INR: `effectiveUsdAfterRounding` ignoriert echte Session-Bet-Levels (z. B. 10 PKR günstiger
 * als kleinstes INR). Wenn die Modell-USD fast gleich sind, PKR vor INR sortieren.
 */
const PKR_INR_MODEL_TIE_USD = 0.012

function comparePkrVsInrInSort(a, b) {
  const pa = (a.tCurr || '').toLowerCase()
  const pb = (b.tCurr || '').toLowerCase()
  if (pa === 'pkr' && pb === 'inr') {
    const d = Math.abs(a.usdEff - b.usdEff)
    if (d <= PKR_INR_MODEL_TIE_USD) return -1
    return a.usdEff - b.usdEff
  }
  if (pa === 'inr' && pb === 'pkr') {
    const d = Math.abs(a.usdEff - b.usdEff)
    if (d <= PKR_INR_MODEL_TIE_USD) return 1
    return a.usdEff - b.usdEff
  }
  return null
}

/**
 * Sortierung für Session-Probes:
 * 1) Fiat vor Crypto (PKR/RUB/… vor LTC/DOGE; Stablecoins USDC/USDT sind hier kein „Fiat“-Probe-Pool — siehe allowedFiat-Filter)
 * 2) niedrigster effektiver USD-Bet (nach Rundung)
 * 3) bei ~gleichem USD: Fiat-Priorität (PKR vor ARS), dann bevorzugte Zielwährung
 * 4) Source-Währung kann optional hart priorisiert werden (Wallet-Safety)
 */
function sortTargetCandidatesForProbe(allowedList, rates, minBetUsd, preferred, sourceCurrencyPreferred = '') {
  const pref = (preferred || 'usd').toLowerCase()
  const sourcePref = String(sourceCurrencyPreferred || '').toLowerCase()
  const candidates = []
  for (const tCurr of allowedList) {
    const rate = getRateForCurrency(rates, tCurr)
    if (!rate || rate <= 0) continue
    const usdEff = effectiveUsdAfterRounding(minBetUsd, rate, tCurr)
    if (usdEff == null || !Number.isFinite(usdEff)) continue
    const excess = usdEff - minBetUsd
    candidates.push({ tCurr, excess, fiat: isFiat(tCurr), usdEff })
  }
  if (candidates.length === 0) return []
  candidates.sort((a, b) => {
    if (sourcePref) {
      const aIsSource = a.tCurr === sourcePref
      const bIsSource = b.tCurr === sourcePref
      if (aIsSource !== bIsSource) return aIsSource ? -1 : 1
    }
    if (a.fiat !== b.fiat) return a.fiat ? -1 : 1
    const pkrInr = comparePkrVsInrInSort(a, b)
    if (pkrInr !== null) return pkrInr
    const du = a.usdEff - b.usdEff
    if (Math.abs(du) > USD_EFF_TIE_EPS) return du
    const ra = fiatProbeRank(a.tCurr)
    const rb = fiatProbeRank(b.tCurr)
    if (ra !== rb) return ra - rb
    if (a.tCurr === pref) return -1
    if (b.tCurr === pref) return 1
    return a.usdEff - b.usdEff
  })
  return candidates.map((c) => c.tCurr)
}

/** Pause zwischen Session-Probes gegen „Please slow down“ / Rate-Limits */
const SESSION_PROBE_DELAY_MS = 400
/**
 * Extra-Pause nach jedem erfolgreichen Spin vor dem nächsten `placeBet`.
 * `stakeEngine.placeBet` erzwingt bereits mindestens 50 ms zwischen Plays (`STAKEENGINE_MIN_DELAY_MS`) — zusätzliche
 * 150 ms hier summierten spürbar (z. B. ~9 s / 100 Spins) und machte uns langsamer als Clients ohne dieses Lag.
 * Bei ERR_VAL / Rate-Limits ggf. auf 50–100 ms erhöhen.
 */
const HUNTER_SPIN_DELAY_MS = 0
/** Nach RGS play/end-round vor GraphQL `rotateSeed`: Monolith-Sync; zu niedrig → Fehler, zu hoch → unnötig langsam. */
const STAKE_RGS_FAIRNESS_AFTER_SPIN_MS = 500
/** Voller Wechsel (rotate + neue Session): so viele Versuche bei Fehler, bevor abgebrochen wird. */
const STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS = 4
const HUNTER_SPIN_ERROR_RETRY_MS = 0
/** Nach Session-Timeout / abgelaufener Session: 2–3s Pause, dann `startSession` + weiter spinnen (max. Versuche). */
const SESSION_TIMEOUT_RECOVERY_DELAY_MS = 2500
const SESSION_TIMEOUT_RECOVERY_MAX = 5
/** Probe-Candidates: kein harter Stablecoin-Ausschluss mehr (USDC/USDT-Funding häufig). */
const AUTO_PROBE_EXCLUDED_CURRENCIES = new Set()

/**
 * MinBet → Einsatz inkl. Bet-Levels; usdAt = effektiver USD-Wert des gewählten Levels.
 */
function computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd) {
  let targetBetUnits = minBetUsd / rate
  if (ZERO_DECIMAL_CURRENCIES.includes(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits)
  } else if (isFiat(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits * 100) / 100
  } else {
    targetBetUnits = Math.ceil(targetBetUnits * 1e8) / 1e8
  }
  let betAmount = toMinor(targetBetUnits, tCurr)
  const betLevels = Array.isArray(session?.betLevels) ? session.betLevels.slice().sort((a, b) => a - b) : []
  if (betLevels.length) {
    const bestLevel = pickSmallestBetLevelForMinUsd(betLevels, tCurr, rate, minBetUsd)
    if (bestLevel != null) {
      betAmount = bestLevel
    } else {
      const nextLevel = betLevels.find((lvl) => lvl >= betAmount)
      if (nextLevel != null) betAmount = nextLevel
    }
  }
  const usdAt = toUnits(betAmount, tCurr) * rate
  return { betAmount, usdAt }
}

function getAllowedTargetCurrenciesForSlot(providerId) {
  const list = PROVIDER_CURRENCIES[providerId] || PROVIDER_CURRENCIES.stakeEngine
  const allowed = new Set(list.map((c) => c.toLowerCase()))
  return HUNTER_TARGET_CANDIDATES.filter((c) => allowed.has(c))
}

function getProbeTargetCurrencies(candidates) {
  const list = Array.isArray(candidates)
    ? candidates.map((c) => String(c || '').toLowerCase()).filter(Boolean)
    : []
  return Array.from(new Set(list))
}

/** Kleinster Bet-Level in Minor, der minBetUsd (USD) noch erfüllt. */
function pickSmallestBetLevelForMinUsd(betLevels, tCurr, rate, minBetUsd) {
  if (!Array.isArray(betLevels) || betLevels.length === 0) return null
  const sorted = [...betLevels].sort((a, b) => a - b)
  let best = null
  let bestUsd = Infinity
  for (const lvl of sorted) {
    const usd = toUnits(lvl, tCurr) * rate
    if (usd + 1e-9 >= minBetUsd) {
      if (usd < bestUsd - 1e-9) {
        bestUsd = usd
        best = lvl
      }
    }
  }
  return best
}

/**
 * fetchChallengeList liefert verschachtelt `game: { slug, name, … }`.
 * fetchAllChallenges mappt auf gameSlug/gameName – der Hunter nutzt Rohlisten, daher vereinheitlichen.
 */
function normalizeChallengeRow(c) {
  if (!c) return c
  const slug = c.gameSlug || c.game?.slug
  const name = c.gameName || c.game?.name
  const providerGroupSlug = extractProviderGroupSlug(c.game)
  return {
    ...c,
    gameSlug: slug,
    gameName: name != null && String(name).trim() !== '' ? name : slug,
    providerGroupSlug,
  }
}

const BEST_MULTI_STORAGE_KEY = 'slotbot_hunter_best_multi_by_slug'
/** Lifetime: Share-ID zum höchsten jemals getroffenen Multi pro Slot (nur houseBets). */
const BEST_BET_ID_OVERALL_KEY = 'slotbot_hunter_best_betid_by_slug'
const CHALLENGE_HITS_STORAGE_KEY = 'slotbot_hunter_challenge_hits'
const PROBE_RANKING_STORAGE_KEY = 'slotbot_hunter_probe_rankings_v1'

function persistChallengeHitRecord(entry) {
  try {
    const raw = localStorage.getItem(CHALLENGE_HITS_STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return
    arr.unshift({ ...entry, at: Date.now() })
    localStorage.setItem(CHALLENGE_HITS_STORAGE_KEY, JSON.stringify(arr.slice(0, 500)))
  } catch (_) {}
}

function loadBestMultiMap() {
  try {
    const raw = localStorage.getItem(BEST_MULTI_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return {}
    return o
  } catch {
    return {}
  }
}

function persistBestMultiMap(map) {
  try {
    localStorage.setItem(BEST_MULTI_STORAGE_KEY, JSON.stringify(map))
  } catch (_) {}
}

function loadBestBetIdMap() {
  try {
    const raw = localStorage.getItem(BEST_BET_ID_OVERALL_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return {}
    const next = {}
    let dirty = false
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== 'string' || !String(v).trim()) continue
      const t = String(v).trim()
      if (isPersistableStakeHouseBetShareId(t)) next[k] = t
      else dirty = true
    }
    if (dirty) {
      try {
        localStorage.setItem(BEST_BET_ID_OVERALL_KEY, JSON.stringify(next))
      } catch (_) {}
    }
    return next
  } catch {
    return {}
  }
}

function persistBestBetIdMap(map) {
  try {
    localStorage.setItem(BEST_BET_ID_OVERALL_KEY, JSON.stringify(map))
  } catch (_) {}
}

function loadProbeRankingMap() {
  try {
    const raw = localStorage.getItem(PROBE_RANKING_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = {}
    for (const [k, list] of Object.entries(parsed)) {
      if (!k || !Array.isArray(list)) continue
      const clean = list
        .map((x) => ({
          tCurr: String(x?.tCurr || '').toLowerCase(),
          usdAt: Number(x?.usdAt),
        }))
        .filter((x) => x.tCurr && Number.isFinite(x.usdAt) && x.usdAt > 0)
        .slice(0, 40)
      if (clean.length > 0) out[k] = clean
    }
    return out
  } catch {
    return {}
  }
}

function persistProbeRankingMap(map) {
  try {
    localStorage.setItem(PROBE_RANKING_STORAGE_KEY, JSON.stringify(map || {}))
  } catch (_) {}
}

/** Lifetime-Rekord-Multi für Slug (Storage + optional React-State-Ref). */
function getOverallBestMultiForSlug(slug, bestMultiBySlotRefObj) {
  if (!slug) return 0
  const fromLs = Number(loadBestMultiMap()[slug])
  const fromRef = bestMultiBySlotRefObj && bestMultiBySlotRefObj[slug] != null ? Number(bestMultiBySlotRefObj[slug]) : 0
  return Math.max(Number.isFinite(fromLs) ? fromLs : 0, Number.isFinite(fromRef) ? fromRef : 0)
}

/** House-Match gehört zum Lifetime-Rekord (gleicher Multi wie bestRecord)? → Overall-Bet-ID speichern. */
function shouldPersistOverallBetId(slug, storageSlug, spinMulti, bestMultiBySlotRefObj) {
  const key = storageSlug || slug
  if (!key || spinMulti == null || !Number.isFinite(Number(spinMulti))) return false
  const best = getOverallBestMultiForSlug(key, bestMultiBySlotRefObj)
  if (best <= 0) return false
  const tol = Math.max(0.03, best * 0.025)
  return Number(spinMulti) + tol >= best
}

function loadOverallBetIdForSlug(slug) {
  if (!slug) return null
  const m = loadBestBetIdMap()
  const v = m[slug]
  return v && isPersistableStakeHouseBetShareId(String(v)) ? String(v).trim() : null
}

/**
 * Rekord-Multi (State), Lifetime-Bet-ID (Storage), Run-Best× + Run-Bet-ID (activeRuns).
 */
function buildHunterBestConsoleSnapshot(bestMultiBySlot, activeRuns) {
  const runBestBySlug = {}
  const betRunBySlug = {}
  for (const r of Object.values(activeRuns || {})) {
    if (!r?.slotSlug) continue
    const slug = r.slotSlug
    const br = Number(r.bestMultiRun) || 0
    if (br > (runBestBySlug[slug] ?? 0)) runBestBySlug[slug] = br
    const bid = r.bestBetId && String(r.bestBetId).trim()
    // Run-Bet-ID: jede gesetzte ID anzeigen (Persist-Regel gilt nur für Lifetime-Map / Links).
    if (bid) {
      const prev = betRunBySlug[slug]
      if (!prev || br >= prev.br) betRunBySlug[slug] = { betId: bid, br }
    }
  }
  let persisted = {}
  try {
    persisted = loadBestBetIdMap() || {}
  } catch (_) {}
  const slugs = new Set([
    ...Object.keys(bestMultiBySlot || {}),
    ...Object.keys(runBestBySlug),
    ...Object.keys(betRunBySlug),
    ...Object.keys(persisted),
  ])
  const rows = []
  for (const slug of slugs) {
    const rec = bestMultiBySlot[slug]
    const bestRecord = rec != null && Number.isFinite(Number(rec)) && Number(rec) > 0 ? Number(rec) : null
    const runBest = runBestBySlug[slug] ?? null
    const betIdOverall =
      persisted[slug] && isPersistableStakeHouseBetShareId(persisted[slug]) ? String(persisted[slug]).trim() : null
    const betIdRun = betRunBySlug[slug]?.betId || null
    if (
      bestRecord != null ||
      (runBest != null && runBest > 0) ||
      betIdOverall ||
      betIdRun
    ) {
      rows.push({
        slug,
        bestRecord: bestRecord != null ? Number(bestRecord.toFixed(4)) : null,
        betIdOverall: betIdOverall || null,
        runBest: runBest != null && runBest > 0 ? Number(runBest.toFixed(4)) : null,
        betIdRun: betIdRun || null,
      })
    }
  }
  rows.sort((a, b) => (b.bestRecord ?? b.runBest ?? 0) - (a.bestRecord ?? a.runBest ?? 0))
  return rows
}

/**
 * Race: WebSocket houseBet kann vor placeBet-HTTP fertig sein — dann war pending leer.
 * Passende Events wieder in die Queue, Worker erneut anstoßen.
 */
function flushHouseBetRetryBufferForSlug(retryBufRef, queueRef, slugNorm, scheduleFn) {
  const buf = retryBufRef.current
  if (!buf.length) return
  const keep = []
  let pushed = 0
  for (const entry of buf) {
    const ps = normalizeBetSlugForHouseMatch(entry.bItem?.gameSlug)
    if (houseBetSlugMatchesSessionSlug(ps, slugNorm)) {
      queueRef.current.push(entry.bItem)
      pushed++
    } else {
      keep.push(entry)
    }
  }
  retryBufRef.current = keep
  if (pushed) scheduleFn?.()
}

const HUNTER_FILTER_STORAGE_KEY = 'slotbot_hunter_filter_settings'

const DEFAULT_HUNTER_FILTERS = {
  minMinBet: 0,
  maxMinBet: 0.2,
  minPrizeUsd: 5,
  sourceCurrency: 'xrp',
  targetCurrency: 'usd',
  maxParallel: 1,
  pagesToLoad: 3,
  stopLoss: 0,
  stopProfit: 0,
  /** Per Kurs+Rundung kleinste USD-Überschreitung über minBet; nach Session: kleinster passender betLevel */
  autoOptimalTargetCurrency: true,
}

function clampHunterInt(n, min, max) {
  const v = parseInt(String(n), 10)
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

function normalizeHunterFilterObject(o) {
  if (!o || typeof o !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
  const src = String(o.sourceCurrency || DEFAULT_HUNTER_FILTERS.sourceCurrency).toLowerCase()
  const tgt = String(o.targetCurrency || DEFAULT_HUNTER_FILTERS.targetCurrency).toLowerCase()
  return {
    minMinBet: Number.isFinite(Number(o.minMinBet)) ? Number(o.minMinBet) : DEFAULT_HUNTER_FILTERS.minMinBet,
    maxMinBet: Number.isFinite(Number(o.maxMinBet)) ? Number(o.maxMinBet) : DEFAULT_HUNTER_FILTERS.maxMinBet,
    minPrizeUsd: Number.isFinite(Number(o.minPrizeUsd)) ? Number(o.minPrizeUsd) : DEFAULT_HUNTER_FILTERS.minPrizeUsd,
    sourceCurrency: src || DEFAULT_HUNTER_FILTERS.sourceCurrency,
    targetCurrency: tgt || DEFAULT_HUNTER_FILTERS.targetCurrency,
    maxParallel: clampHunterInt(o.maxParallel, 1, CHALLENGE_SLIDER_MAX),
    pagesToLoad: clampHunterInt(o.pagesToLoad, 1, CHALLENGE_SLIDER_MAX),
    stopLoss: Number.isFinite(Number(o.stopLoss)) ? Number(o.stopLoss) : 0,
    stopProfit: Number.isFinite(Number(o.stopProfit)) ? Number(o.stopProfit) : 0,
    autoOptimalTargetCurrency:
      typeof o.autoOptimalTargetCurrency === 'boolean'
        ? o.autoOptimalTargetCurrency
        : DEFAULT_HUNTER_FILTERS.autoOptimalTargetCurrency,
  }
}

/** Nur Filter-Felder (ohne id/name) für Vorlagen */
function pickHunterFilters(record) {
  if (!record || typeof record !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
  const { id: _id, name: _name, ...rest } = record
  return normalizeHunterFilterObject(rest)
}

const HUNTER_USER_PRESETS_KEY = 'slotbot_hunter_user_presets_v1'

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(HUNTER_USER_PRESETS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p === 'object' && String(p.name || '').trim())
      .map((p) => {
        const id = String(p.id || '').trim() || `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const name = String(p.name).trim().slice(0, 80)
        const filters = pickHunterFilters(p)
        return { id, name, ...filters }
      })
  } catch {
    return []
  }
}

function persistUserPresets(list) {
  try {
    localStorage.setItem(HUNTER_USER_PRESETS_KEY, JSON.stringify(list))
  } catch (_) {}
}

function loadHunterFilters() {
  try {
    const raw = localStorage.getItem(HUNTER_FILTER_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_HUNTER_FILTERS }
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
    return normalizeHunterFilterObject(o)
  } catch {
    return { ...DEFAULT_HUNTER_FILTERS }
  }
}

function saveHunterFilters(payload) {
  try {
    localStorage.setItem(HUNTER_FILTER_STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
}

/** Einmal beim Modul-Load – konsistente Startwerte für alle useState-Felder */
const hunterFiltersInitial = loadHunterFilters()

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    height: '100%',
    overflow: 'hidden',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  input: {
    padding: '0.4rem',
    background: 'var(--bg-deep)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontSize: '0.85rem',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    marginBottom: '0.25rem',
    fontVariantNumeric: 'tabular-nums',
  }
}

export default function AutoChallengeHunter({ accessToken, webSlots = [], onDiscoveredSlots, onHubStatsChange }) {
  const hubRecentBets = useChallengeHubRecentBets()
  const [minMinBet, setMinMinBet] = useState(hunterFiltersInitial.minMinBet)
  const [maxMinBet, setMaxMinBet] = useState(hunterFiltersInitial.maxMinBet)
  const [minPrizeUsd, setMinPrizeUsd] = useState(hunterFiltersInitial.minPrizeUsd)
  const [sourceCurrency, setSourceCurrency] = useState(hunterFiltersInitial.sourceCurrency)
  const [targetCurrency, setTargetCurrency] = useState(hunterFiltersInitial.targetCurrency)
  const [huntEnabled, setHuntEnabled] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [maxParallel, setMaxParallel] = useState(hunterFiltersInitial.maxParallel)
  const [pagesToLoad, setPagesToLoad] = useState(hunterFiltersInitial.pagesToLoad)
  const [stopLoss, setStopLoss] = useState(hunterFiltersInitial.stopLoss)
  const [stopProfit, setStopProfit] = useState(hunterFiltersInitial.stopProfit)
  const [stopLossStr, setStopLossStr] = useState(() => usdLimitToInputStr(hunterFiltersInitial.stopLoss))
  const [stopProfitStr, setStopProfitStr] = useState(() => usdLimitToInputStr(hunterFiltersInitial.stopProfit))
  const [autoOptimalTargetCurrency, setAutoOptimalTargetCurrency] = useState(
    hunterFiltersInitial.autoOptimalTargetCurrency
  )

  const [userPresets, setUserPresets] = useState(() => loadUserPresets())
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [presetSelectValue, setPresetSelectValue] = useState('')

  const cryptoOptions = useMemo(() => CURRENCY_GROUPS.crypto, [])
  const fiatOptions = useMemo(() => CURRENCY_GROUPS.fiat, [])
  /** Dropdown: gleiche Kandidaten wie Session-Probes (stakeEngine). */
  const hunterTargetCurrencyOptions = useMemo(() => {
    const allowed = getAllowedTargetCurrenciesForSlot('stakeEngine')
    const probeCandidates = getProbeTargetCurrencies(allowed)
    return [...probeCandidates].sort((a, b) => a.localeCompare(b))
  }, [])

  const prefersReducedMotion = usePrefersReducedMotion()

  const [challenges, setChallenges] = useState([])
  const [localChallenges, setLocalChallenges] = useState([])
  const localChallengesRef = useRef([])
  useEffect(() => {
    localChallengesRef.current = localChallenges
  }, [localChallenges])
  const [localChallengeSlotSlug, setLocalChallengeSlotSlug] = useState('')
  const [localChallengeTargetMulti, setLocalChallengeTargetMulti] = useState('10')
  const [localChallengeMinBetUsd, setLocalChallengeMinBetUsd] = useState('0.10')
  const [localChallengeExpanded, setLocalChallengeExpanded] = useState(false)
  const [localChallengeSlotSearch, setLocalChallengeSlotSearch] = useState('')
  const [opsSectionsOpen, setOpsSectionsOpen] = useState({
    presets: true,
    local: false,
    runtime: true,
  })
  const [challengeSearch, setChallengeSearch] = useState('')
  const [challengeSort, setChallengeSort] = useState('prize-desc')
  /** Pro Challenge: nächste Queue-Zielwährung — '' = Auto (Sortierung / Probes). */
  const [manualTargetCurrencyByChallengeId, setManualTargetCurrencyByChallengeId] = useState({})
  const [queue, setQueue] = useState([])
  const foundScrollRef = useRef(null)
  const queueRef = useRef([])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  const [activeRuns, setActiveRuns] = useState({})
  const [rates, setRates] = useState({})
  const ratesRef = useRef(rates)
  useEffect(() => {
    ratesRef.current = rates
  }, [rates])
  const [logs, setLogs] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [totalSessionStats, setTotalSessionStats] = useState({ wagered: 0, payout: 0, profit: 0 })
  const totalSessionStatsRef = useRef({ wagered: 0, payout: 0, profit: 0 })
  const sessionStatsUiDirtyRef = useRef(false)
  const ENABLE_SESSION_NET_CHART = true
  const sessionNetBufferRef = useRef(new ProfitCircularBuffer(PROFIT_CHART_CAPACITY))
  const sessionNetTotalSpinsRef = useRef(0)
  const [sessionNetSeriesVersion, setSessionNetSeriesVersion] = useState(0)
  const [sessionNetSpinCount, setSessionNetSpinCount] = useState(0)
  const sessionNetChartFlushTimerRef = useRef(null)
  const sessionNetSeriesSnapshot = useMemo(
    () => sessionNetBufferRef.current.toChartSeries(),
    [sessionNetSeriesVersion]
  )
  const sessionChartBetRange = useMemo(() => {
    const total = sessionNetSpinCount
    const window = sessionNetBufferRef.current.pointCount
    if (total <= 0) return { start: 1, end: 0 }
    if (window <= 0 || total <= window) return { start: 1, end: total }
    return { start: total - window + 1, end: total }
  }, [sessionNetSpinCount, sessionNetSeriesVersion])
  /** Höchster getroffener Multiplikator pro Slot-Slug (persistiert). */
  const [bestMultiBySlot, setBestMultiBySlot] = useState(() => loadBestMultiMap())
  useEffect(() => {
    if (typeof onHubStatsChange !== 'function') return
    const running = Object.values(activeRuns).filter((run) => run?.status === 'running').length
    const completed = Object.values(activeRuns).filter((run) => run?.status === 'target_hit' || run?.status === 'completed').length
    const bestMulti = Object.values(bestMultiBySlot).reduce((max, value) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.max(max, n) : max
    }, 0)
    onHubStatsChange({
      source: 'casino',
      queued: queue.length,
      running,
      completed,
      bestMulti,
      ts: Date.now(),
    })
  }, [queue.length, activeRuns, bestMultiBySlot, onHubStatsChange])

  const setBestMultiBySlotRef = useRef(setBestMultiBySlot)
  setBestMultiBySlotRef.current = setBestMultiBySlot
  const bestMultiBySlotRef = useRef(bestMultiBySlot)
  useEffect(() => {
    bestMultiBySlotRef.current = bestMultiBySlot
  }, [bestMultiBySlot])
  /** Pro Run: max. Multi — wird mit houseBets bestätigt (wie bestMultiRun im State nach WS). */
  const runBestMultiSyncRef = useRef({})
  /** Memoized measured ranking from first probe pass: [{ tCurr, usdAt }] sorted by real effective USD. */
  const challengeProbeRankingRef = useRef(loadProbeRankingMap())
  /** Nach Persist der Overall-Bet-ID: UI/Konsole neu lesen. */
  const [hunterStorageTick, setHunterStorageTick] = useState(0)
  const bumpHunterStorageRef = useRef(() => {})
  useEffect(() => {
    bumpHunterStorageRef.current = () => setHunterStorageTick((t) => t + 1)
  }, [])

  useEffect(() => {
    const next = {}
    for (const run of Object.values(activeRuns)) {
      if (run?.status !== 'running' || !run.slotSlug) continue
      const m = Number(run.targetMultiplier)
      if (!Number.isFinite(m) || m <= 0) continue
      const slug = run.slotSlug
      if (!next[slug]) next[slug] = []
      next[slug].push(m)
    }
    for (const k of Object.keys(next)) {
      next[k] = [...new Set(next[k])].sort((a, b) => a - b)
    }
    setHunterSlotTargets(next)
  }, [activeRuns])

  useEffect(() => {
    const hasRunningChallenges =
      huntEnabled ||
      queue.length > 0 ||
      Object.values(activeRuns).some((run) => run?.status === 'running')
    try {
      window.dispatchEvent(
        new CustomEvent('challenge-running-status', {
          detail: { running: hasRunningChallenges },
        })
      )
    } catch (_) {}
    return () => {
      try {
        window.dispatchEvent(
          new CustomEvent('challenge-running-status', {
            detail: { running: false },
          })
        )
      } catch (_) {}
    }
  }, [huntEnabled, queue, activeRuns])

  const maxParallelClamped = Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, maxParallel))
  const pagesToLoadClamped = Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, pagesToLoad))

  const runnersRef = useRef({})
  /** Schutz gegen doppelte Verbuchung desselben Rounds innerhalb eines Runs (z. B. Retry/Timing-Rennen). */
  const seenRoundKeysByRunRef = useRef({})
  /** FIFO zu `seenRoundKeysByRunRef`: älteste Keys verwerfen, sobald Obergrenze erreicht (Speicher bei Langläufern). */
  const seenRoundOrderByRunRef = useRef({})
  const processedIdsRef = useRef(new Set())
  /** Challenge-IDs, die der Nutzer per „Aus Liste“ o. Ä. aus dem Hunt genommen hat – nicht erneut auto-einreihen. */
  const dismissedChallengeIdsRef = useRef(new Set())
  const activeRunsUiDirtyRef = useRef(false)
  const activeRunsRef = useRef(activeRuns)
  if (!activeRunsUiDirtyRef.current) {
    activeRunsRef.current = activeRuns
  }
  const activeRunsUiFlushTimerRef = useRef(null)
  const houseShareIdByProviderBetIdRef = useRef(new Map())
  const flushActiveRunsToReact = useCallback(() => {
    if (activeRunsUiFlushTimerRef.current != null) {
      clearTimeout(activeRunsUiFlushTimerRef.current)
      activeRunsUiFlushTimerRef.current = null
    }
    let didFlush = false
    if (activeRunsUiDirtyRef.current) {
      activeRunsUiDirtyRef.current = false
      setActiveRuns({ ...(activeRunsRef.current || {}) })
      didFlush = true
    }
    if (sessionStatsUiDirtyRef.current) {
      sessionStatsUiDirtyRef.current = false
      setTotalSessionStats({ ...totalSessionStatsRef.current })
      didFlush = true
    }
    if (!didFlush) return
  }, [])
  const scheduleActiveRunsUiFlush = useCallback(
    (opts = {}) => {
      activeRunsUiDirtyRef.current = true
      if (opts.immediate) {
        flushActiveRunsToReact()
        return
      }
      if (activeRunsUiFlushTimerRef.current != null) return
      activeRunsUiFlushTimerRef.current = setTimeout(() => {
        activeRunsUiFlushTimerRef.current = null
        flushActiveRunsToReact()
      }, HUNTER_ACTIVE_RUNS_UI_FLUSH_MS)
    },
    [flushActiveRunsToReact]
  )
  const patchActiveRunInRef = useCallback((runId, patch) => {
    const rid = String(runId || '')
    if (!rid || !patch || typeof patch !== 'object') return
    const ar = activeRunsRef.current || {}
    const run = ar[rid]
    if (!run) return
    activeRunsRef.current = { ...ar, [rid]: { ...run, ...patch } }
    activeRunsUiDirtyRef.current = true
  }, [])
  const loggerBetIdReconcileTimersRef = useRef({})
  const prevBestMultiForLoggerRef = useRef(null)

  const runLoggerBetIdReconcile = useCallback((runId) => {
    const rid = String(runId || '')
    if (!rid) return
    void (async () => {
      const run = activeRunsRef.current?.[rid]
      if (!run || run.status !== 'running') return
      const api = typeof window !== 'undefined' ? window.electronAPI : null
      if (!api?.loadLoggerBetLogs) return

      const targetMulti = Number(run.bestMultiRun) || 0
      if (targetMulti <= 0) return

      let rows
      try {
        rows = await api.loadLoggerBetLogs({ limit: LOGGER_BET_ID_RECONCILE_ROW_LIMIT })
      } catch (_) {
        return
      }
      if (!Array.isArray(rows) || rows.length === 0) return

      const st = run.startTime
      const startMs =
        typeof st === 'number' && Number.isFinite(st)
          ? st
          : Date.parse(String(st || run.createdAt || ''))
      const minTs =
        Number.isFinite(startMs) && startMs > 0 ? startMs - 15000 : Date.now() - 8 * 60 * 1000

      const runBetMajor =
        run.currentBet != null && run.runCurrency
          ? toUnits(Number(run.currentBet), String(run.runCurrency).toLowerCase())
          : null
      const row = findLoggerRowForHunterBestMulti(rows, run, targetMulti, minTs, runBetMajor)
      if (!row) return

      const raw = pickLoggerRowHouseShareRaw(row)
      const loggerShare = formatStakeShareBetId(raw)
      if (!loggerShare || !isPersistableStakeHouseBetShareId(loggerShare)) return

      if (areStakeShareIdsEquivalent(run.bestBetId, loggerShare)) return

      setActiveRuns((prev) => {
        const r = prev[rid]
        if (!r || r.status !== 'running') return prev
        if (areStakeShareIdsEquivalent(r.bestBetId, loggerShare)) return prev
        return {
          ...prev,
          [rid]: { ...r, bestBetId: loggerShare },
        }
      })
      patchHubFeedRunShareId(rid, loggerShare, {
        multiplier: targetMulti,
        settlementSource: 'logger_reconcile',
      })
    })()
  }, [])

  useEffect(() => {
    const runs = activeRuns || {}
    const prevMap = prevBestMultiForLoggerRef.current
    if (prevMap == null) {
      const seed = {}
      for (const [rid, run] of Object.entries(runs)) {
        if (run?.status === 'running') seed[rid] = Number(run.bestMultiRun) || 0
      }
      prevBestMultiForLoggerRef.current = seed
      return
    }

    for (const rid of Object.keys(loggerBetIdReconcileTimersRef.current)) {
      if (!runs[rid] || runs[rid]?.status !== 'running') {
        const t = loggerBetIdReconcileTimersRef.current[rid]
        if (t) clearTimeout(t)
        delete loggerBetIdReconcileTimersRef.current[rid]
      }
    }

    for (const [rid, run] of Object.entries(runs)) {
      if (run?.status !== 'running') {
        delete prevMap[rid]
        clearPendingHouseBetsForRun(pendingHouseBetMatchRef.current, rid)
        continue
      }
      const cur = Number(run.bestMultiRun) || 0
      const was = prevMap[rid] ?? 0
      if (cur > was + 1e-12) {
        prevMap[rid] = cur
        const existing = loggerBetIdReconcileTimersRef.current[rid]
        if (existing) clearTimeout(existing)
        loggerBetIdReconcileTimersRef.current[rid] = setTimeout(() => {
          delete loggerBetIdReconcileTimersRef.current[rid]
          runLoggerBetIdReconcile(rid)
        }, LOGGER_BET_ID_RECONCILE_DELAY_MS)
      }
    }
  }, [activeRuns, runLoggerBetIdReconcile])

  useEffect(() => {
    return () => {
      for (const t of Object.values(loggerBetIdReconcileTimersRef.current)) {
        if (t) clearTimeout(t)
      }
      loggerBetIdReconcileTimersRef.current = {}
    }
  }, [])

  const resolveChallengeSlugById = useCallback(
    (challengeId) => {
      const row = (challenges || []).find((c) => String(c?.id || '') === String(challengeId || ''))
      return String(row?.gameSlug || row?.game?.slug || '').toLowerCase()
    },
    [challenges]
  )
  const getNextCurrencySlotIndexForGroup = useCallback(
    (queueSnapshot, challengeId, sourceCurrencyOverride = null, slotSlugOverride = null) => {
      const sourceKey = String(sourceCurrencyOverride || sourceCurrency || 'usd').toLowerCase()
      const targetSlug = String(slotSlugOverride || resolveChallengeSlugById(challengeId)).toLowerCase()
      if (!targetSlug) return 0

      let maxIdx = -1
      const qList = Array.isArray(queueSnapshot) ? queueSnapshot : []
      for (const item of qList) {
        const n = normalizeQueueItem(item)
        const qSource = String(n.sourceCurrency || sourceKey).toLowerCase()
        if (qSource !== sourceKey) continue
        const qSlug = String(n.slotSlug || resolveChallengeSlugById(n.challengeId)).toLowerCase()
        if (qSlug !== targetSlug) continue
        const idx = Number(n.currencySlotIndex)
        if (Number.isFinite(idx)) maxIdx = Math.max(maxIdx, Math.floor(idx))
      }

      for (const run of Object.values(activeRunsRef.current || {})) {
        const runSource = String(run?.runSourceCurrency || sourceKey).toLowerCase()
        if (runSource !== sourceKey) continue
        const runSlug = String(run?.slotSlug || '').toLowerCase()
        if (runSlug !== targetSlug) continue
        const idx = Number(run?.currencySlotIndex)
        if (Number.isFinite(idx)) maxIdx = Math.max(maxIdx, Math.floor(idx))
      }

      return maxIdx + 1
    },
    [resolveChallengeSlugById, sourceCurrency]
  )
  const buildQueueItemForChallenge = useCallback(
    (challengeId, queueSnapshot, forcedTargetCurrency = null, sourceCurrencyOverride = null, slotSlugOverride = null) => {
      const src = String(sourceCurrencyOverride || sourceCurrency || 'usd').toLowerCase()
      const slug = String(slotSlugOverride || resolveChallengeSlugById(challengeId)).toLowerCase()
      const slotIndex = getNextCurrencySlotIndexForGroup(queueSnapshot, challengeId, src, slug)
      return {
        runId: generateHunterRunId(),
        challengeId,
        currencySlotIndex: slotIndex,
        sourceCurrency: src,
        slotSlug: slug || null,
        stakeRgsSeedResetEvery: 0,
        ...(forcedTargetCurrency ? { forcedTargetCurrency: String(forcedTargetCurrency).toLowerCase() } : {}),
      }
    },
    [getNextCurrencySlotIndexForGroup, resolveChallengeSlugById, sourceCurrency]
  )
  const totalStatsRef = useRef(totalSessionStats)
  if (!sessionStatsUiDirtyRef.current) {
    totalSessionStatsRef.current = totalSessionStats
  }
  totalStatsRef.current = totalSessionStatsRef.current
  const scheduleSessionNetChartFlush = useCallback(() => {
    if (!ENABLE_SESSION_NET_CHART) return
    if (sessionNetChartFlushTimerRef.current != null) return
    sessionNetChartFlushTimerRef.current = setTimeout(() => {
      sessionNetChartFlushTimerRef.current = null
      setSessionNetSeriesVersion((v) => v + 1)
      setSessionNetSpinCount(sessionNetTotalSpinsRef.current)
    }, 220)
  }, [ENABLE_SESSION_NET_CHART])
  /** Stabil für refreshChallenges-Deps: sonst ändert sich webSlots bei jeder Discovery → useEffect feuert endlos. */
  const webSlotsRef = useRef(webSlots)
  webSlotsRef.current = webSlots
  const onDiscoveredSlotsRef = useRef(onDiscoveredSlots)
  onDiscoveredSlotsRef.current = onDiscoveredSlots

  useEffect(() => {
    const persisted = getHunterState()
    processedIdsRef.current = new Set(persisted.processedIds || [])
    dismissedChallengeIdsRef.current = new Set(persisted.dismissedIds || [])
  }, [])

  useEffect(() => {
    return () => {
      if (sessionNetChartFlushTimerRef.current != null) {
        clearTimeout(sessionNetChartFlushTimerRef.current)
        sessionNetChartFlushTimerRef.current = null
      }
      if (activeRunsUiFlushTimerRef.current != null) {
        clearTimeout(activeRunsUiFlushTimerRef.current)
        activeRunsUiFlushTimerRef.current = null
      }
      flushActiveRunsToReact()
      void flushHunterBetHistory()
    }
  }, [flushActiveRunsToReact])

  useEffect(() => {
    const persist = () => {
      saveHunterState(
        Array.from(processedIdsRef.current || []),
        Array.from(dismissedChallengeIdsRef.current || [])
      )
    }
    persist()
    const id = setInterval(persist, 2500)
    return () => {
      clearInterval(id)
      persist()
    }
  }, [])

  // Debug/Test: in Challenge-Mode Subscription unabhängig von SlotControl sichtbar machen
  // (SlotControl wird im "challenges"-Tab typischerweise nicht gemountet.)
  /** Nach placeBet: Pending pro runId; houseBets-Match strikt innerhalb des Laufs, Konflikt → ältestes `at`. */
  const pendingHouseBetMatchRef = useRef({})
  /** Pro Run monoton steigend — ordnet Pending-Spins zu, Fallback nur wenn `${runId}:${seq}` nicht gematcht. */
  const hunterSpinSeqByRunRef = useRef({})
  /** Pro Spin: Fallback-Timer für HTTP-Best-Multi; bei houseBets-Match canceln (sonst stapeln sich 100k+ Timer). */
  const houseBetDeferredUiTimersRef = useRef(new Map())

  // houseBets Updates kommen sehr häufig.
  // Damit React keine "message handler took Xms"-Violations auslöst (und wir weniger UI/Storage churn haben),
  // enqueue wir Events und verarbeiten sie gebündelt in einem Worker-Tick.
  const houseBetEventQueueRef = useRef([])
  const houseBetWorkerScheduledRef = useRef(false)
  /** Race WS vor HTTP: houseBet-Objekte kurz halten, nach Pending-Push erneut matchen. */
  const houseBetRetryBufferRef = useRef([]) // { key, bItem, at }[]
  const scheduleHouseBetWorkerRef = useRef(() => {})
  const HOUSEBET_WORKER_MAX_EVENTS = 20
  const logBufferRef = useRef([])
  const logFlushTimerRef = useRef(null)

  const flushLogsNow = useCallback(() => {
    if (logBufferRef.current.length === 0) return
    const buffered = logBufferRef.current.splice(0, logBufferRef.current.length)
    setLogs((prev) => [...buffered.reverse(), ...prev].slice(0, 100))
  }, [])

  const log = useCallback((msg) => {
    logBufferRef.current.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
    if (logFlushTimerRef.current) return
    logFlushTimerRef.current = setTimeout(() => {
      logFlushTimerRef.current = null
      flushLogsNow()
    }, 120)
  }, [flushLogsNow])

  useEffect(() => {
    return () => {
      if (logFlushTimerRef.current) {
        clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
      flushLogsNow()
    }
  }, [flushLogsNow])

  useEffect(() => {
    function onExternalPromoQueue(ev) {
      const detail = ev?.detail || {}
      const slotSlug = String(detail.gameSlug || '').trim().toLowerCase()
      if (!slotSlug) return
      const gameName = String(detail.gameName || slotSlug)
      const providerId = String(detail.providerId || 'stakeEngine')
      const promoSource = String(detail.promoSource || 'promotion').trim().toLowerCase()
      const targetMultiplierRaw = Number(detail.targetMultiplier || 0)
      const targetMultiplier = Number.isFinite(targetMultiplierRaw) && targetMultiplierRaw > 1 ? targetMultiplierRaw : 2
      const minBetUsdRaw = Number(detail.minBetUsd || 0)
      const minBetUsd = Number.isFinite(minBetUsdRaw) && minBetUsdRaw > 0 ? minBetUsdRaw : 0.09
      const challengeId =
        String(detail.challengeId || '').trim() ||
        `promo:${promoSource}:${slotSlug}:${targetMultiplier.toFixed(2)}`

      const syntheticChallenge = {
        id: challengeId,
        title: `${gameName} (${promoSource})`,
        gameSlug: slotSlug,
        gameName,
        game: { slug: slotSlug, name: gameName, providerId },
        targetMultiplier,
        minBetUsd,
        award: Math.max(1, minBetUsd * 10),
        currency: 'usd',
        active: true,
        completedAt: null,
        source: promoSource,
        createdAt: new Date().toISOString(),
      }

      setChallenges((prev) => [
        syntheticChallenge,
        ...prev.filter((c) => String(c?.id || '') !== challengeId),
      ])

      let queuedNow = false
      setQueue((prev) => {
        if (prev.some((item) => normalizeQueueItem(item).challengeId === challengeId)) return prev
        queuedNow = true
        const manual = String(detail.forcedTargetCurrency || detail.targetCurrency || '').trim().toLowerCase()
        return [
          ...prev,
          buildQueueItemForChallenge(
            challengeId,
            prev,
            manual || null,
            sourceCurrency,
            slotSlug
          ),
        ]
      })

      processedIdsRef.current.add(challengeId)
      dismissedChallengeIdsRef.current.delete(challengeId)
      try {
        onDiscoveredSlotsRef.current?.([{ slug: slotSlug, name: gameName, providerId }])
      } catch {
        // ignore discovery sync errors
      }
      // Promo-queued items should appear as cards only; start remains manual (Start Next / Auto Hunt).
      setAutoStart(false)
      setLastRefresh(Date.now())
      log(
        queuedNow
          ? `Promo queued: ${gameName} (${targetMultiplier.toFixed(2)}x)`
          : `Promo already queued: ${gameName} (${targetMultiplier.toFixed(2)}x)`
      )
    }

    window.addEventListener('challenge-hunt-queue-add', onExternalPromoQueue)
    return () => window.removeEventListener('challenge-hunt-queue-add', onExternalPromoQueue)
  }, [log, buildQueueItemForChallenge, sourceCurrency])

  const hunterConsoleSnapshotRef = useRef('')
  useEffect(() => {
    if (!LOG_HUNTER_BEST_TO_CONSOLE) return
    const rows = buildHunterBestConsoleSnapshot(bestMultiBySlot, activeRuns)
    const key = JSON.stringify(rows)
    if (key === hunterConsoleSnapshotRef.current) return
    hunterConsoleSnapshotRef.current = key
    console.log(
      '%c[Hunter] Best Multi / Bet-IDs',
      'color:#39d98a;font-weight:bold',
      '— betIdOverall = lifetime (slot) · betIdRun = this run · houseBets only'
    )
    if (rows.length) console.table(rows)
    else console.log('[Hunter] (no best× or bet ID rows yet)')
  }, [bestMultiBySlot, activeRuns, hunterStorageTick])

  useEffect(() => {
    if (!accessToken) return

    if (DEBUG_HUNTER_BETID_MATCH) {
      console.warn('[AutoChallengeHunter] houseBets subscription init', {
        hasAccessToken: !!accessToken,
      })
    }

    let cancelled = false
    let sub = null

    const runWorkerTick = () => {
      // Kein stakeHouseBetAmountToMajor / kein Betrag-Multi-Match — iid aus houseBets; Pending pro runId + ältestes `at` bei Konflikt.
      houseBetWorkerScheduledRef.current = false

      const rnow = Date.now()
      houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.filter(
        (e) => rnow - e.at < HOUSEBET_RETRY_BUFFER_MAX_MS
      )
      if (houseBetRetryBufferRef.current.length > HOUSEBET_RETRY_BUFFER_MAX) {
        houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.slice(
          -HOUSEBET_RETRY_BUFFER_MAX
        )
      }

      const q = houseBetEventQueueRef.current
      if (q.length === 0) return

        // Time-slicing: nur wenige Events pro Tick, damit der Main-Thread nicht lange blockiert
        const batch = q.splice(0, HOUSEBET_WORKER_MAX_EVENTS)
        // Sammeln von Matches, damit wir React nur 1x pro Tick updaten
        const bestBetByRunId = {}
        const multiUiByRunId = {}
        const betIdToPersistOverall = {}
        /** Pro Run: max. Multi bereits in diesem Batch verarbeitet (für prevBest + korrekte Reihenfolge). */
        const batchRunBestMulti = {}
        for (const bItem of batch) {
          const payloadSlug = normalizeBetSlugForHouseMatch(bItem?.gameSlug)
          const payloadCurr = String(bItem?.currency || '').toLowerCase()

          const active = activeRunsRef.current || {}
          const runningSlugList = Object.values(active)
            .filter((r) => r?.status === 'running' && r?.slotSlug)
            .map((r) => normalizeBetSlugForHouseMatch(r.slotSlug))
          const pendingMap = pendingHouseBetMatchRef.current
          const hasRunningForHouseBet = payloadSlug
            ? (
              runningSlugList.some((s) => houseBetSlugMatchesSessionSlug(payloadSlug, s)) ||
              hasPendingHouseBetForPayloadSlug(pendingMap, payloadSlug)
            )
            : (
              Object.values(active).some((r) => r?.status === 'running') ||
              Object.keys(pendingMap || {}).some((rid) => Array.isArray(pendingMap[rid]) && pendingMap[rid].length > 0)
            )
          if (!hasRunningForHouseBet) continue

          const directProviderBetId = String(bItem?.betId || '').trim()
          const p =
            splicePendingHouseBetByProviderBetId(pendingMap, payloadSlug, directProviderBetId) ||
            (payloadSlug
              ? splicePendingHouseBetMatch(pendingMap, payloadSlug, payloadCurr, bItem)
              : splicePendingHouseBetMatchWithoutSlug(pendingMap, payloadCurr, bItem))

          if (p) {
            const runId = p.runId
            const rawId = pickStakeHouseBetShareRawId(bItem)
            const shareId = rawId ? formatStakeShareBetId(rawId) : null

            const spinM = Number(p.multi) || 0
            const houseBetCurr = String(bItem?.currency || p.currency || '').toLowerCase()
            const houseBetRate = getRateForCurrency(ratesRef.current || {}, houseBetCurr)
            const stakeMajor = Number(bItem?.amountMajor ?? bItem?.amount ?? p.betAmountMajor ?? 0)
            const houseBetMulti = Number(bItem?.payoutMultiplier)
            const effectiveMulti =
              Number.isFinite(houseBetMulti) && houseBetMulti >= 0 ? houseBetMulti : spinM
            const trackMulti = Math.max(spinM, effectiveMulti)
            const prevBest = Math.max(
              activeRunsRef.current[runId]?.bestMultiRun ?? 0,
              batchRunBestMulti[runId] ?? 0
            )
            batchRunBestMulti[runId] = Math.max(prevBest, trackMulti)

            // UI: höchster Multi in diesem Batch gewinnt (nicht nur das letzte Event).
            const prevUiM = multiUiByRunId[runId]?.multi ?? 0
            if (trackMulti > prevUiM) {
              multiUiByRunId[runId] = {
                multi: trackMulti,
                storageSlug: p.storageSlug,
                slug: p.slug,
                spinSeq: p.spinSeq,
              }
            } else if (!multiUiByRunId[runId]) {
              multiUiByRunId[runId] = {
                multi: trackMulti,
                storageSlug: p.storageSlug,
                slug: p.slug,
                spinSeq: p.spinSeq,
              }
            }

            if (shareId) {
              if (directProviderBetId) {
                houseShareIdByProviderBetIdRef.current.set(directProviderBetId, shareId)
              }
              bestBetByRunId[runId] = shareId
              const key = p.storageSlug != null ? p.storageSlug : p.slug
              if (
                isPersistableStakeHouseBetShareId(shareId) &&
                shouldPersistOverallBetId(p.slug, key, trackMulti, bestMultiBySlotRef.current)
              ) {
                betIdToPersistOverall[key] = shareId
              }
            }
            if (p.feedEntryId) {
              const patchCurr = String(
                bItem?.currency || p.currency || houseBetCurr || 'usd'
              ).toLowerCase()
              const amountPatch =
                Number.isFinite(stakeMajor) && stakeMajor > 0
                  ? {
                      betAmount: toMinor(stakeMajor, patchCurr),
                      winAmount: toMinor(
                        stakeMajor * Math.max(0, Number(effectiveMulti) || 0),
                        patchCurr
                      ),
                      multiplier: Math.max(0, Number(effectiveMulti) || 0),
                      currencyCode: patchCurr.toUpperCase(),
                    }
                  : { currencyCode: patchCurr.toUpperCase() }
              patchHubFeedEntryFromHouseBet(p.feedEntryId, bItem, amountPatch)
              if (p.spinSeq != null) {
                const mk = `${runId}:${p.spinSeq}`
                const tid = houseBetDeferredUiTimersRef.current.get(mk)
                if (tid != null) {
                  clearTimeout(tid)
                  houseBetDeferredUiTimersRef.current.delete(mk)
                }
              }
            }
          }

          if (!p && hasRunningForHouseBet) {
            const rawShareFallback = pickStakeHouseBetShareRawId(bItem)
            const shareIdFallback = rawShareFallback ? formatStakeShareBetId(rawShareFallback) : null
            if (shareIdFallback) {
              const candidateRuns = Object.values(active).filter((r) => {
                if (!r || r.status !== 'running') return false
                const runSlug = normalizeBetSlugForHouseMatch(r.slotSlug)
                if (!houseBetSlugMatchesSessionSlug(payloadSlug, runSlug)) return false
                if (!payloadCurr) return true
                const runCurr = String(r.runCurrency || '').toLowerCase()
                return !runCurr || runCurr === payloadCurr
              })
              if (candidateRuns.length === 1) {
                const targetRun = candidateRuns[0]
                const targetRunId = targetRun.id
                if (
                  targetRunId &&
                  !areStakeShareIdsEquivalent(targetRun.bestBetId, shareIdFallback)
                ) {
                  bestBetByRunId[targetRunId] = shareIdFallback
                }
                const hbMultiFallback = Number(bItem?.payoutMultiplier)
                if (targetRunId && Number.isFinite(hbMultiFallback) && hbMultiFallback > 0) {
                  const prevUiM = multiUiByRunId[targetRunId]?.multi ?? 0
                  if (hbMultiFallback > prevUiM) {
                    multiUiByRunId[targetRunId] = {
                      multi: hbMultiFallback,
                      storageSlug: targetRun.slotSlug,
                      slug: targetRun.slotSlug,
                      spinSeq: null,
                    }
                  }
                }
                if (targetRunId) {
                  patchHubFeedRunFromHouseBet(targetRunId, bItem)
                }
              }
            }
            // Ohne Pending (WS vor HTTP) oder mit Pending aber kein sicherer Match (z. B. Timing) — später erneut matchen.
            const dedupeKey = pickStakeHouseBetShareRawId(bItem) || bItem?.id
            if (dedupeKey) {
              const buf = houseBetRetryBufferRef.current
              if (!buf.some((e) => e.key === dedupeKey)) {
                buf.push({ key: dedupeKey, bItem, at: Date.now() })
                if (buf.length > HOUSEBET_RETRY_BUFFER_MAX) buf.shift()
              }
            }
          }
        }

      // 1x React update + 1x localStorage persist pro Tick
      const runIds = [
        ...new Set([...Object.keys(bestBetByRunId), ...Object.keys(multiUiByRunId)]),
      ]
      if (runIds.length) {
        for (const runId of runIds) {
          const m = multiUiByRunId[runId]
          if (m && m.multi != null && Number.isFinite(Number(m.multi))) {
            const prevS = runBestMultiSyncRef.current[runId] ?? 0
            runBestMultiSyncRef.current[runId] = Math.max(Number(prevS) || 0, Number(m.multi))
          }
        }

        setActiveRuns((prev) => {
          const next = { ...prev }
          for (const runId of runIds) {
            const run = next[runId]
            if (!run || run.status !== 'running') continue
            const refRun = activeRunsUiDirtyRef.current
              ? activeRunsRef.current?.[runId]
              : null
            const baseRun = refRun ? { ...run, ...refRun } : run
            const m = multiUiByRunId[runId]
            const nextBest =
              m && m.multi != null && Number.isFinite(Number(m.multi))
                ? Math.max(baseRun.bestMultiRun ?? 0, Number(m.multi))
                : baseRun.bestMultiRun
            const bid = bestBetByRunId[runId]
            next[runId] = {
              ...baseRun,
              bestBetId: bid != null ? bid : baseRun.bestBetId ?? null,
              bestMultiRun: nextBest,
            }
          }
          activeRunsRef.current = next
          return next
        })

        for (const runId of runIds) {
          const m = multiUiByRunId[runId]
          if (!m || m.multi == null || !Number.isFinite(Number(m.multi))) continue
          const slugKey = m.storageSlug != null ? m.storageSlug : m.slug
          setBestMultiBySlotRef.current((prev) => {
            const cur = prev[slugKey] ?? 0
            const nm = Number(m.multi)
            if (nm <= cur) return prev
            const nmap = { ...prev, [slugKey]: nm }
            persistBestMultiMap(nmap)
            return nmap
          })
        }

        try {
          const keys = Object.keys(betIdToPersistOverall)
          if (keys.length) {
            const bestBetIdMap = loadBestBetIdMap()
            const merged = { ...bestBetIdMap }
            for (const k of keys) {
              const v = betIdToPersistOverall[k]
              if (v && isPersistableStakeHouseBetShareId(v)) merged[k] = v
            }
            persistBestBetIdMap(merged)
            bumpHunterStorageRef.current?.()
          }
        } catch (_) {}

        if (DEBUG_HUNTER_BETID_MATCH) {
          log(`houseBets: Bet ID + best multi for ${runIds.length} run(s) (after houseBets).`)
        }
      }

      // Wenn noch Events drin sind, direkt wieder planend
      if (houseBetEventQueueRef.current.length > 0) {
        houseBetWorkerScheduledRef.current = true
        setTimeout(runWorkerTick, 0)
      }
    }

    const scheduleHouseBetWorker = () => {
      if (houseBetWorkerScheduledRef.current) return
      houseBetWorkerScheduledRef.current = true
      setTimeout(runWorkerTick, 0)
    }
    scheduleHouseBetWorkerRef.current = scheduleHouseBetWorker

    const shouldEnqueueHouseBet = () => {
      const ar = activeRunsRef.current || {}
      if (Object.values(ar).some((r) => r?.status === 'running')) return true
      if (houseBetRetryBufferRef.current.length > 0) return true
      const pm = pendingHouseBetMatchRef.current
      for (const rid of Object.keys(pm || {})) {
        const v = pm[rid]
        if (Array.isArray(v) && v.length) return true
      }
      return false
    }

    subscribeToHouseBets(accessToken, (b) => {
      const betType = String(b?.betType || '')
      if (/sport/i.test(betType)) return
      if (!shouldEnqueueHouseBet()) return
      const now = Date.now()
      prunePendingHouseBetMap(pendingHouseBetMatchRef.current, now)
      houseBetEventQueueRef.current.push(b)
      if (houseBetEventQueueRef.current.length > HOUSEBET_EVENT_QUEUE_MAX) {
        houseBetEventQueueRef.current.splice(
          0,
          houseBetEventQueueRef.current.length - HOUSEBET_EVENT_QUEUE_MAX
        )
      }
      scheduleHouseBetWorker()
    }).then((s) => {
      if (cancelled) {
        try {
          s?.disconnect?.()
        } catch (_) {}
        return
      }
      sub = s
    })

    return () => {
      cancelled = true
      scheduleHouseBetWorkerRef.current = () => {}
      houseBetRetryBufferRef.current = []
      try {
        sub?.disconnect?.()
      } catch (_) {}
    }
  }, [accessToken, log])

  const applyFilters = useCallback((partial) => {
    const n = pickHunterFilters(partial)
    setMinMinBet(n.minMinBet)
    setMaxMinBet(n.maxMinBet)
    setMinPrizeUsd(n.minPrizeUsd)
    setSourceCurrency(n.sourceCurrency)
    setTargetCurrency(n.targetCurrency)
    setMaxParallel(n.maxParallel)
    setPagesToLoad(n.pagesToLoad)
    setStopLoss(n.stopLoss)
    setStopProfit(n.stopProfit)
    setStopLossStr(usdLimitToInputStr(n.stopLoss))
    setStopProfitStr(usdLimitToInputStr(n.stopProfit))
    setAutoOptimalTargetCurrency(n.autoOptimalTargetCurrency)
  }, [])

  const restoreDefaultFilters = useCallback(() => {
    applyFilters(DEFAULT_HUNTER_FILTERS)
    setPresetSelectValue('')
    log('Filters reset to defaults (saved).')
  }, [applyFilters, log])

  const loadPresetById = useCallback(
    (id) => {
      if (!id) return
      const user = userPresets.find((p) => p.id === id)
      if (user) {
        applyFilters(user)
        log(`Preset loaded: ${user.name}`)
      }
    },
    [applyFilters, userPresets, log]
  )

  const saveCurrentPreset = useCallback(() => {
    const name = presetNameDraft.trim()
    if (!name) {
      log('Please enter a name for the preset.')
      return
    }
    const raw = {
      minMinBet,
      maxMinBet,
      minPrizeUsd,
      sourceCurrency,
      targetCurrency,
      maxParallel: maxParallelClamped,
      pagesToLoad: pagesToLoadClamped,
      stopLoss,
      stopProfit,
      autoOptimalTargetCurrency,
    }
    const nameLower = name.toLowerCase()
    const existing = userPresets.find((p) => p.name.toLowerCase() === nameLower)
    const id = existing?.id || crypto.randomUUID()
    const entry = { id, name, ...pickHunterFilters(raw) }
    setUserPresets((prev) => {
      const next = [...prev.filter((p) => p.id !== id), entry]
      persistUserPresets(next)
      return next
    })
    setPresetSelectValue(id)
    log(`Preset saved: ${name}`)
  }, [
    presetNameDraft,
    minMinBet,
    maxMinBet,
    minPrizeUsd,
    sourceCurrency,
    targetCurrency,
    maxParallelClamped,
    pagesToLoadClamped,
    stopLoss,
    stopProfit,
    autoOptimalTargetCurrency,
    userPresets,
    log,
  ])

  const deleteSelectedUserPreset = useCallback(() => {
    if (!presetSelectValue) return
    const isUser = userPresets.some((p) => p.id === presetSelectValue)
    if (!isUser) {
      log('Only saved presets can be deleted.')
      return
    }
    setUserPresets((prev) => {
      const next = prev.filter((p) => p.id !== presetSelectValue)
      persistUserPresets(next)
      return next
    })
    setPresetSelectValue('')
    log('Preset deleted.')
  }, [presetSelectValue, userPresets, log])

  useEffect(() => {
    saveHunterFilters({
      minMinBet,
      maxMinBet,
      minPrizeUsd,
      sourceCurrency,
      targetCurrency,
      maxParallel: Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, maxParallel)),
      pagesToLoad: Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, pagesToLoad)),
      stopLoss,
      stopProfit,
      autoOptimalTargetCurrency,
    })
  }, [
    minMinBet,
    maxMinBet,
    minPrizeUsd,
    sourceCurrency,
    targetCurrency,
    maxParallel,
    pagesToLoad,
    stopLoss,
    stopProfit,
    autoOptimalTargetCurrency,
  ])

  const refreshChallenges = useCallback(async () => {
    if (!accessToken) return
    try {
      log('Loading challenges & rates...')
      
      // Rates laden für Umrechnungen
      const newRates = await fetchCurrencyRates(accessToken)
      setRates(newRates)

      const pageCount = Math.max(1, pagesToLoadClamped)
      const requests = Array.from({ length: pageCount }, (_, i) =>
        fetchChallengeList(accessToken, { limit: PAGE_SIZE, offset: PAGE_SIZE * i })
      )
      
      const results = await Promise.all(requests)
      const all = results.flatMap((r) => r.challenges || [])
      
      // Duplikate entfernen (durch Pagination Überschneidung möglich)
      const unique = []
      const seen = new Set()
      for (const c of all) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          unique.push(normalizeChallengeRow(c))
        }
      }

      const localOnly = localChallengesRef.current || []
      const merged = [...localOnly, ...unique.filter((c) => !localOnly.some((l) => String(l.id) === String(c.id)))]
      log(`${unique.length} Stake challenges found (${localOnly.length} local).`)
      setChallenges(merged)
      setLastRefresh(Date.now())

      // Neue Slots/Provider automatisch hinzufügen (Session-only)
      const slotsSnapshot = webSlotsRef.current || []
      const knownSlugs = new Set(slotsSnapshot.map((s) => s.slug))
      const addedSlots = addDiscoveredFromChallenges(unique, knownSlugs)
      if (addedSlots.length > 0) {
        log(`${addedSlots.length} new slots/providers discovered: ${addedSlots.map(s => s.name).join(', ')}`)
        onDiscoveredSlotsRef.current?.(addedSlots)
      }

      // Kombiniere vorhandene Slots mit neu entdeckten für diese Runde
      const currentSlots = [...slotsSnapshot, ...addedSlots]

      let addedCount = 0
      for (const c of merged) {
        if (processedIdsRef.current.has(c.id)) continue
        if (dismissedChallengeIdsRef.current.has(c.id)) continue
        if (
          Object.values(activeRunsRef.current).some(
            (r) => r.challengeId === c.id && r.status === 'running'
          )
        )
          continue
        
        const minBet = c.minBetUsd || 0
        const prizeUsd = getPrizeUsd(c, newRates)
        const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
        const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
        
        const cSlug = c.gameSlug || c.game?.slug
        const cName = c.gameName || c.game?.name || cSlug
        // Nutze currentSlots statt webSlots (Prop)
        let slot = currentSlots.find((s) => s.slug === cSlug)
        if (!slot) {
          slot = { slug: cSlug, name: cName || cSlug, id: cSlug }
        }

        // isSlotOk ist immer true, da wir Fallback haben. 
        // WICHTIG: Wenn wir 100% Logik wollen, sollten wir prüfen, ob wir ihn spielen KÖNNEN.
        // Aber die Anforderung war "Availability Logic: Enforced 'Available' status... defaults to simulation".
        // Also ist eligible = true korrekt.
        
        const eligible =
          isMinBetOk && isPrizeOk && !c.completedAt && c.active !== false

        if (eligible) {
          let queuedNow = false
          const srcKey = String(sourceCurrency || 'usd').toLowerCase()
          setQueue((q) => {
            const hasSameSlotInQueue = q.some((item) => {
              const n = normalizeQueueItem(item)
              const qSource = String(n.sourceCurrency || srcKey).toLowerCase()
              if (qSource !== srcKey) return false
              const qSlug = String(n.slotSlug || resolveChallengeSlugById(n.challengeId)).toLowerCase()
              return Boolean(cSlug) && qSlug === cSlug
            })
            const hasSameSlotRunning = Object.values(activeRunsRef.current || {}).some((run) => {
              if (!run || run.status !== 'running') return false
              const runSource = String(run.runSourceCurrency || srcKey).toLowerCase()
              if (runSource !== srcKey) return false
              return String(run.slotSlug || '').toLowerCase() === String(cSlug || '').toLowerCase()
            })
            if (hasSameSlotInQueue || hasSameSlotRunning) return q
            queuedNow = true
            return [...q, buildQueueItemForChallenge(c.id, q, null, sourceCurrency, cSlug)]
          })
          if (queuedNow) {
            log(`New challenge: ${cName} (${c.minBetUsd}$)`)
            processedIdsRef.current.add(c.id)
            addedCount++
          }
        } else {
          if (c.completedAt || c.active === false) processedIdsRef.current.add(c.id)
        }
      }
      
      if (addedCount > 0) log(`${addedCount} challenges added to queue.`)

    } catch (err) {
      log(`Load error: ${err.message}`)
    }
  }, [accessToken, minMinBet, maxMinBet, minPrizeUsd, pagesToLoadClamped, log, buildQueueItemForChallenge, sourceCurrency])

  const createLocalChallenge = useCallback(() => {
    const slotSlug = String(localChallengeSlotSlug || '').trim().toLowerCase()
    if (!slotSlug) {
      log('Local challenge: please select a game first.')
      return
    }
    const slot = (webSlotsRef.current || []).find((s) => String(s?.slug || '').toLowerCase() === slotSlug)
    if (!slot) {
      log(`Local challenge: slot not found (${slotSlug}).`)
      return
    }
    const targetMultiplierRaw = Number(localChallengeTargetMulti)
    const minBetUsdRaw = Number(localChallengeMinBetUsd)
    const targetMultiplier = Number.isFinite(targetMultiplierRaw) && targetMultiplierRaw > 1 ? targetMultiplierRaw : 10
    const minBetUsd = Number.isFinite(minBetUsdRaw) && minBetUsdRaw > 0 ? minBetUsdRaw : 0.1
    const challengeId = `local:${slotSlug}:${targetMultiplier.toFixed(2)}:${Date.now()}`
    const localChallenge = {
      id: challengeId,
      title: `${slot.name || slotSlug} (local)`,
      gameSlug: slotSlug,
      gameName: slot.name || slotSlug,
      game: { slug: slotSlug, name: slot.name || slotSlug, providerId: slot.providerId || 'stakeEngine' },
      targetMultiplier,
      minBetUsd,
      award: 0,
      currency: 'usd',
      active: true,
      completedAt: null,
      source: 'local',
      createdAt: new Date().toISOString(),
      _isLocalChallenge: true,
    }
    setLocalChallenges((prev) => [localChallenge, ...prev])
    setChallenges((prev) => [localChallenge, ...prev.filter((c) => String(c?.id || '') !== challengeId)])
    dismissedChallengeIdsRef.current.delete(challengeId)
    processedIdsRef.current.add(challengeId)
    setQueue((q) => [...q, buildQueueItemForChallenge(challengeId, q, null, sourceCurrency, slotSlug)])
    log(`Local challenge created: ${slot.name || slotSlug} (${targetMultiplier.toFixed(2)}x, min $${minBetUsd.toFixed(2)})`)
  }, [
    localChallengeSlotSlug,
    localChallengeTargetMulti,
    localChallengeMinBetUsd,
    buildQueueItemForChallenge,
    sourceCurrency,
    log,
  ])

  useEffect(() => {
    if (!huntEnabled) return
    requestNotificationPermission() // Berechtigung anfragen beim Aktivieren
    refreshChallenges()
    const interval = setInterval(refreshChallenges, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [huntEnabled, refreshChallenges])

  useEffect(() => {
    if (!autoStart) return
    requestNotificationPermission() // Berechtigung anfragen beim Auto-Start
    if (queue.length > 0) return
    const hasRunning = Object.values(activeRuns).some((run) => run?.status === 'running')
    if (hasRunning) return
    processedIdsRef.current.clear()
    refreshChallenges()
  }, [autoStart, queue.length, activeRuns, refreshChallenges])

  const getPrizeUsd = (c, currentRates = rates) => {
    if (c.award == null) return 0
    const currency = (c.currency || 'usd').toLowerCase()
    if (currency === 'usd') return c.award
    const rate = currentRates[currency] || 0
    if (!rate) return 0
    return c.award * rate
  }

  /** Anzeige Gewinn/Preis der Challenge: USD-Näherung + optional Betrag in Spiel-Währung */
  const formatChallengePrize = (c) => {
    if (c.award == null || !(Number(c.award) > 0)) return { main: '—', hint: null }
    const usd = getPrizeUsd(c)
    const main = `~$${usd.toFixed(2)}`
    const cur = (c.currency || 'usd').toLowerCase()
    let hint = null
    if (cur !== 'usd' && c.currency) {
      try {
        hint = formatBetLabel(c.award, c.currency)
      } catch {
        hint = null
      }
    }
    return { main, hint }
  }

  const formatPrize = (c) => formatChallengePrize(c).main

  const getChallengeMeta = useCallback((c) => {
    const minBet = c.minBetUsd || 0
    const prizeUsd = getPrizeUsd(c, rates)
    const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
    const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
    const slots = webSlotsRef.current || []
    const slug = c.gameSlug || c.game?.slug
    const displayName = c.gameName || c.game?.name || slug
    let slot = slots.find((s) => s.slug === slug)
    if (!slot) {
      slot = { slug, name: displayName || slug, id: slug }
    }
    const isSlotOk = true
    const eligible =
      isMinBetOk && isPrizeOk && isSlotOk && !c.completedAt && c.active !== false
    return { minBet, prizeUsd, isMinBetOk, isPrizeOk, slot, isSlotOk, eligible }
  }, [minMinBet, maxMinBet, minPrizeUsd, rates])

  const activeRunList = useMemo(() => {
    return Object.entries(activeRuns).map(([id, run]) => ({ id, ...run }))
  }, [activeRuns])

  const runningCount = activeRunList.filter(r => r.status === 'running').length
  const runningCountByChallengeId = useMemo(() => {
    const map = {}
    for (const run of Object.values(activeRuns)) {
      if (!run?.challengeId || run?.status !== 'running') continue
      map[run.challengeId] = (map[run.challengeId] || 0) + 1
    }
    return map
  }, [activeRuns])
  const finishedCountByChallengeId = useMemo(() => {
    const map = {}
    for (const run of Object.values(activeRuns)) {
      if (!run?.challengeId || run?.status === 'running') continue
      map[run.challengeId] = (map[run.challengeId] || 0) + 1
    }
    return map
  }, [activeRuns])
  const queueCountByChallengeId = useMemo(() => {
    const map = {}
    for (const item of queue) {
      const normalized = normalizeQueueItem(item)
      map[normalized.challengeId] = (map[normalized.challengeId] || 0) + 1
    }
    return map
  }, [queue])

  const netUsd = totalSessionStats.profit

  const hasAnythingToStop =
    runningCount > 0 || queue.length > 0 || huntEnabled || autoStart

  const eligibleChallenges = useMemo(() => {
    return challenges.filter((c) => {
      const meta = getChallengeMeta(c)
      return meta.eligible
    })
  }, [challenges, getChallengeMeta])

  useEffect(() => {
    if (!huntEnabled || !autoStart || queue.length === 0) return
    if (runningCount >= maxParallelClamped) return
    const nextId = queue[0]
    setQueue(q => q.slice(1))
    startChallengeRun(nextId)
  }, [huntEnabled, autoStart, queue, runningCount, maxParallelClamped])

  useEffect(() => {
    if (!huntEnabled || !autoStart) return
    if (queue.length > 0) return
    if (runningCount >= maxParallelClamped) return
    const toQueue = eligibleChallenges
      .map((c) => c.id)
      .filter(
        (id) =>
          !processedIdsRef.current.has(id) && !dismissedChallengeIdsRef.current.has(id)
      )
    if (toQueue.length === 0) return
    setQueue((q) => [
      ...q,
      ...toQueue.map((id) => buildQueueItemForChallenge(id, q)),
    ])
    toQueue.forEach((id) => processedIdsRef.current.add(id))
  }, [huntEnabled, autoStart, queue.length, runningCount, maxParallelClamped, eligibleChallenges, buildQueueItemForChallenge])

  const startChallengeRun = async (queueItemRaw) => {
    const qItem = normalizeQueueItem(queueItemRaw)
    const {
      runId,
      challengeId,
      currencySlotIndex,
      forcedTargetCurrency: forcedRaw,
      sourceCurrency: queuedSourceRaw,
      stakeRgsSeedResetEvery: queuedSeedEvery,
    } = qItem
    const initialStakeRgsSeedResetEvery = Math.max(
      0,
      Math.min(100000, parseInt(String(queuedSeedEvery ?? 0), 10) || 0)
    )
    const forced = (forcedRaw || '').trim().toLowerCase()
    const challenge = challenges.find((c) => c.id === challengeId)
    if (!challenge) {
      log(`Challenge ${challengeId} not found anymore.`)
      return
    }

    const targetMRaw = Number(challenge.targetMultiplier)
    const targetOk = Number.isFinite(targetMRaw) && targetMRaw > 1
    const targetM = targetOk ? targetMRaw : 0

    const gSlug = challenge.gameSlug || challenge.game?.slug
    const gName = challenge.gameName || challenge.game?.name || gSlug
    let slot = (webSlotsRef.current || []).find((s) => s.slug === gSlug)
    const resolvedPid = resolveHunterProviderId(gSlug, challenge.game)
    if (!slot) {
      slot = {
        slug: gSlug,
        name: gName || gSlug,
        providerId: resolvedPid,
        ...(challenge.game?.id != null ? { stakeGameId: String(challenge.game.id) } : {}),
      }
    } else {
      if (String(slot.providerId || '').toLowerCase() === 'stakeengine' && resolvedPid !== 'stakeengine') {
        slot = { ...slot, providerId: resolvedPid }
      }
      if (!slot.stakeGameId && challenge.game?.id != null) {
        slot = { ...slot, stakeGameId: String(challenge.game.id) }
      }
    }

    const prizeParts = formatChallengePrize(challenge)
    const sCurr = String(queuedSourceRaw || sourceCurrency || 'usd').toLowerCase()
    runnersRef.current[runId] = { stop: false }
    runBestMultiSyncRef.current[runId] = 0
    setActiveRuns((prev) => ({
      ...prev,
      [runId]: {
        challengeId,
        runId,
        currencySlotIndex,
        status: 'running',
        spins: 0,
        wagered: 0,
        /** Gleiche USD-Einsatz-Spur wie Session-KPI (kpi.wagered), nicht nachträglich minorToUsd(Summe Minor). */
        wageredUsd: 0,
        /** Kumuliertes Spin-Netto in USD: Σ(win − bet) = Σ(kpi.profit). */
        wonUsd: 0,
        balance: 0,
        currentBet: 0,
        slotName: slot.name,
        slotSlug: gSlug,
        providerId: slot.providerId || 'stakeEngine',
        bestMultiRun: 0,
        bestBetId: null,
        stakeRgsSeedResetEvery: initialStakeRgsSeedResetEvery,
        targetMultiplier: challenge.targetMultiplier,
        prizeDisplay: prizeParts.main,
        prizeHint: prizeParts.hint,
        startTime: Date.now(),
        forcedTargetCurrency: forced || null,
        runSourceCurrency: sCurr,
      },
    }))

    const copyLabel = currencySlotIndex > 0 ? ` (Copy #${currencySlotIndex + 1})` : ''
    const manualCurrLabel = forced ? ` · ${forced.toUpperCase()} (manual)` : ''
    log(`Starting challenge: ${gName}${copyLabel}${manualCurrLabel} (target: ${challenge.targetMultiplier}x)`)
    notifyChallengeStart(gName || gSlug, challenge.targetMultiplier)

    try {
      const provider = await getProvider(slot.providerId)
      if (!provider) throw new Error(`No provider found for ${slot.providerId}`)

      const providerId = slot.providerId || 'stakeEngine'
      const preferredTarget = (targetCurrency || 'usd').toLowerCase()
      const minBetUsd = challenge.minBetUsd
      const probeCacheKey = buildProbeCacheKey(providerId, slot.slug, sCurr, minBetUsd)
      const isStakeRgsRun = String(providerId || '').toLowerCase() === 'stakeengine'

      let stakeGameIdForFairness = String(slot?.stakeGameId || challenge?.game?.id || '').trim()
      if (!stakeGameIdForFairness) {
        const w = (webSlotsRef.current || []).find((s) => String(s.slug || '') === String(gSlug || ''))
        if (w?.stakeGameId) stakeGameIdForFairness = String(w.stakeGameId).trim()
      }

      const noteSessionFairnessId = (sess) => {
        if (sess?.stakeGameId) stakeGameIdForFairness = String(sess.stakeGameId).trim()
      }

      let session = null
      let tCurr = preferredTarget
      let rate
      let betAmount
      let stakeRgsSpinsSinceSeedReset = 0

      if (forced) {
        const r = getRateForCurrency(rates, forced)
        if (!r) throw new Error(`No rate for ${forced.toUpperCase()}`)
        tCurr = forced
        rate = r
        log(`Session with manual target currency: ${sCurr.toUpperCase()} → ${forced.toUpperCase()}…`)
        session = await provider.startSession(accessToken, slot.slug, sCurr, forced)
        noteSessionFairnessId(session)
        const computed = computeBetFromMinBetAndSession(session, forced, r, minBetUsd)
        betAmount = computed.betAmount
        log(
          `Manual: effective stake ~$${computed.usdAt.toFixed(2)} USD · challenge min bet (Stake, USD): $${minBetUsd}`
        )
      } else if (autoOptimalTargetCurrency) {
        const allowed = getAllowedTargetCurrenciesForSlot(providerId)
        const probeAllowed = getProbeTargetCurrencies(allowed).filter((c) => {
          const cc = String(c).toLowerCase()
          return !AUTO_PROBE_EXCLUDED_CURRENCIES.has(cc)
        })
        /** Klassische Fiat nur (keine Stablecoins): USDC/USDT sind in currencyMeta als FIAT markiert, gehören aber nicht zur Fiat-Probe. */
        const allowedFiat = probeAllowed.filter((c) => isFiat(c) && !isStable(c))
        const probePool = allowedFiat.length > 0 ? allowedFiat : probeAllowed
        let probeRates = rates
        let ordered =
          probePool.length && minBetUsd != null
            ? sortTargetCandidatesForProbe(probePool, probeRates, minBetUsd, preferredTarget, sCurr)
            : []
        const cachedRanking = Array.isArray(challengeProbeRankingRef.current[probeCacheKey])
          ? challengeProbeRankingRef.current[probeCacheKey]
          : []
        const cachedOrder = cachedRanking
          .map((x) => String(x?.tCurr || '').toLowerCase())
          .filter((c) => c && ordered.includes(c))
        if (cachedOrder.length > 0) {
          const unseen = ordered.filter((c) => !cachedOrder.includes(c))
          ordered = [...cachedOrder, ...unseen]
        }

        // Fehlende FX-Rates: Kandidaten fallen in sortTargetCandidatesForProbe raus — Rates nachladen, bis alle Probe-Pool-Fiats Kurse haben (oder Refresh scheitert).
        if (ordered.length < probePool.length && probePool.length > 1) {
          try {
            log('Probe rates incomplete — refreshing FX for target-currency probe…')
            const freshRates = await fetchCurrencyRates(accessToken, { force: true })
            if (freshRates && typeof freshRates === 'object') {
              const mergedRates = { ...(probeRates || {}), ...freshRates }
              probeRates = mergedRates
              setRates((prev) => ({ ...(prev || {}), ...freshRates }))
              ordered =
                probePool.length && minBetUsd != null
                  ? sortTargetCandidatesForProbe(probePool, probeRates, minBetUsd, preferredTarget, sCurr)
                  : ordered
            }
          } catch (rateErr) {
            log(`FX refresh for probe failed: ${String(rateErr?.message || rateErr)}`)
          }
        }

        if (currencySlotIndex === 0 && ordered.length > 0) {
          const probeLimit = ordered.length
          let bestProbe = null
          const measuredProbes = []

          for (let i = 0; i < probeLimit; i++) {
            if (i > 0) {
              await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
            }
            const cand = ordered[i]
            const r = getRateForCurrency(probeRates, cand)
            if (!r) continue
            try {
              log(`Session-Probe: ${sCurr.toUpperCase()} -> ${cand.toUpperCase()}…`)
              const sess = await provider.startSession(accessToken, slot.slug, sCurr, cand)
              const { betAmount: ba, usdAt } = computeBetFromMinBetAndSession(sess, cand, r, minBetUsd)
              measuredProbes.push({ tCurr: cand, usdAt })
              if (!bestProbe || usdAt < bestProbe.usdAt - 1e-9) {
                bestProbe = { session: sess, tCurr: cand, rate: r, betAmount: ba, usdAt }
              }
            } catch (e) {
              log(`Probe ${cand.toUpperCase()}: ${e?.message || e}`)
            }
          }

          if (bestProbe) {
            if (measuredProbes.length > 0) {
              const dedup = new Map()
              for (const p of measuredProbes) {
                const k = String(p.tCurr || '').toLowerCase()
                if (!k) continue
                const ex = dedup.get(k)
                if (!ex || p.usdAt < ex.usdAt) dedup.set(k, { tCurr: k, usdAt: p.usdAt })
              }
              challengeProbeRankingRef.current[probeCacheKey] = Array.from(dedup.values()).sort(
                (a, b) => a.usdAt - b.usdAt
              )
              persistProbeRankingMap(challengeProbeRankingRef.current)
            }
            tCurr = bestProbe.tCurr
            rate = bestProbe.rate
            log(
              `Auto target currency (bet levels): ${tCurr.toUpperCase()} — effective stake ~$${bestProbe.usdAt.toFixed(2)} USD · challenge min (Stake, USD): $${minBetUsd}`
            )
            if (probeLimit > 1) {
              log(`  (${probeLimit} probes; picked: lowest effective USD bet)`)
            }
            /**
             * Wichtig: Jede Probe ruft startSession auf — beim Anbieter (z. B. Hacksaw) ist oft nur die
             * *letzte* Session aktiv. Die NGN-Session aus einer frühen Probe ist nach weiteren Proben ungültig
             * → vor Spins einmal frisch für die gewählte Zielwährung öffnen.
             */
            if (probeLimit > 1) {
              await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
              log(`Restarting session for ${tCurr.toUpperCase()} after probes (valid for spins)…`)
              session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
              noteSessionFairnessId(session)
              const recomputed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
              betAmount = recomputed.betAmount
              log(
                `Stake after fresh session: ${formatAmount(betAmount, tCurr)} ${tCurr.toUpperCase()} (≈ $${recomputed.usdAt.toFixed(2)} USD)`
              )
            } else {
              session = bestProbe.session
              noteSessionFairnessId(session)
              betAmount = bestProbe.betAmount
            }
          }
        } else if (currencySlotIndex > 0 && ordered.length > 0) {
          let measured = Array.isArray(challengeProbeRankingRef.current[probeCacheKey])
            ? challengeProbeRankingRef.current[probeCacheKey].map((x) => x.tCurr).filter(Boolean)
            : []
          if (measured.length === 0) {
            const measuredProbes = []
            for (let i = 0; i < ordered.length; i++) {
              if (i > 0) await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
              const candProbe = ordered[i]
              const rProbe = getRateForCurrency(probeRates, candProbe)
              if (!rProbe) continue
              try {
                log(`Session probe (copy): ${sCurr.toUpperCase()} -> ${candProbe.toUpperCase()}…`)
                const sessProbe = await provider.startSession(accessToken, slot.slug, sCurr, candProbe)
                const { usdAt } = computeBetFromMinBetAndSession(sessProbe, candProbe, rProbe, minBetUsd)
                measuredProbes.push({ tCurr: candProbe, usdAt })
              } catch (probeErr) {
                log(`Probe ${candProbe.toUpperCase()}: ${probeErr?.message || probeErr}`)
              }
            }
            if (measuredProbes.length > 0) {
              const dedup = new Map()
              for (const p of measuredProbes) {
                const k = String(p.tCurr || '').toLowerCase()
                if (!k) continue
                const ex = dedup.get(k)
                if (!ex || p.usdAt < ex.usdAt) dedup.set(k, { tCurr: k, usdAt: p.usdAt })
              }
              challengeProbeRankingRef.current[probeCacheKey] = Array.from(dedup.values()).sort(
                (a, b) => a.usdAt - b.usdAt
              )
              persistProbeRankingMap(challengeProbeRankingRef.current)
              measured = challengeProbeRankingRef.current[probeCacheKey].map((x) => x.tCurr).filter(Boolean)
            }
          }
          const ranked = measured.length > 0 ? measured : ordered
          const idx = Math.min(currencySlotIndex, ranked.length - 1)
          const cand = ranked[idx]
          const r = getRateForCurrency(probeRates, cand)
          if (!r) {
            log(`No rate for ${String(cand).toUpperCase()} — fallback to manual target currency.`)
          } else {
            try {
              if (idx !== currencySlotIndex) {
                log(
                  `Only ${ranked.length} target candidates — using index ${idx} instead of ${currencySlotIndex} (${cand.toUpperCase()})`
                )
              } else {
                log(
                  `Target currency copy #${currencySlotIndex + 1}: ${cand.toUpperCase()} (${measured.length > 0 ? 'measured' : 'modeled'} sorting, index ${idx})`
                )
              }
              await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
              const sess = await provider.startSession(accessToken, slot.slug, sCurr, cand)
              const { betAmount: ba, usdAt } = computeBetFromMinBetAndSession(sess, cand, r, minBetUsd)
              session = sess
              noteSessionFairnessId(session)
              tCurr = cand
              rate = r
              betAmount = ba
              log(
                `Effective stake ~$${usdAt.toFixed(2)} USD in ${cand.toUpperCase()} · challenge min (Stake, USD): $${minBetUsd}`
              )
            } catch (e) {
              log(`Session ${cand.toUpperCase()}: ${e?.message || e}`)
              throw e
            }
          }
        } else if (currencySlotIndex > 0 && ordered.length === 0) {
          log('No target candidates for copy assignment — falling back to manual target currency.')
        }
      }

      if (!session) {
        const allowedTargets = getAllowedTargetCurrenciesForSlot(providerId)
        let targetForStart = preferredTarget
        if (!allowedTargets.includes(targetForStart)) {
          const pick =
            ['usd', 'eur', 'usdc'].find((c) => allowedTargets.includes(c)) || allowedTargets[0] || 'eur'
          log(
            `Target currency ${preferredTarget.toUpperCase()} not in provider list — fallback ${pick.toUpperCase()} (avoids GraphQL invalid_enum).`
          )
          targetForStart = pick
        }
        tCurr = targetForStart
        log(`Starting session: ${sCurr.toUpperCase()} -> ${tCurr.toUpperCase()}...`)
        session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
        noteSessionFairnessId(session)
        rate = getRateForCurrency(rates, tCurr)
        if (!rate) throw new Error(`No rate for ${tCurr.toUpperCase()}`)
        const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
        betAmount = computed.betAmount
        log(
          `Effective stake ~$${computed.usdAt.toFixed(2)} USD · challenge min (Stake, USD): $${minBetUsd}`
        )
      }

      const betUsdLine =
        rate && betAmount != null ? (toUnits(betAmount, tCurr) * rate).toFixed(2) : null
      log(
        `Computed stake: ${formatAmount(betAmount, tCurr)} ${tCurr.toUpperCase()}` +
          (betUsdLine != null ? ` (≈ $${betUsdLine} USD)` : '') +
          ` · challenge minimum (Stake, USD-only constraint): $${minBetUsd}`
      )
      setActiveRuns((prev) => ({
        ...prev,
        [runId]: {
          ...prev[runId],
          currentBet: betAmount,
          runCurrency: tCurr,
        },
      }))

      let stopReason = null
      let targetHit = false
      /** Nach erstem Ziel-Treffer: 1 = noch ein `placeBet` (RGS/Challenge „abschließen“), 0 = Run beenden. */
      let finalizeSpinsRemaining = 0
      let challengeHitPersisted = false
      let pragmaticRecoveryAttempts = 0
      let sessionTimeoutRecoveryAttempts = 0
      while (!runnersRef.current[runId]?.stop) {
        if (targetHit && finalizeSpinsRemaining === 0) {
          log('Target hit — final spin done, run ended.')
          break
        }
        let targetDetectedThisLoop = false
        /** houseBets zeigt Ziel schon vor diesem `placeBet` — der laufende Spin ist der Abschluss, Zähler noch in derselben Runde runter. */
        let houseBetFirstTargetSignal = false
        const total = totalStatsRef.current
        const net = total.won - total.lost
        if (stopLoss > 0 && net <= -Math.abs(stopLoss)) {
          log(`Stop loss reached: net $${net.toFixed(2)} (limit: -$${Math.abs(stopLoss).toFixed(2)}) — stopping all runs, auto off, queue cleared.`)
          Object.keys(runnersRef.current).forEach((id) => {
            if (runnersRef.current[id]) runnersRef.current[id].stop = true
          })
          setAutoStart(false)
          setQueue([])
          processedIdsRef.current.clear()
          stopReason = 'stop_loss'
          break
        }
        if (stopProfit > 0 && net >= Math.abs(stopProfit)) {
          log(`Stop profit reached: net $${net.toFixed(2)} (limit: +$${Math.abs(stopProfit).toFixed(2)}) — stopping all runs, auto off, queue cleared.`)
          Object.keys(runnersRef.current).forEach((id) => {
            if (runnersRef.current[id]) runnersRef.current[id].stop = true
          })
          setAutoStart(false)
          setQueue([])
          processedIdsRef.current.clear()
          stopReason = 'stop_profit'
          break
        }

        if (targetOk) {
          const ar = activeRunsRef.current[runId]
          const syncB = Number(runBestMultiSyncRef.current[runId]) || 0
          const stB = Number(ar?.bestMultiRun) || 0
          const best = Math.max(syncB, stB)
          if (best >= targetM) {
            if (!targetHit) {
              targetHit = true
              finalizeSpinsRemaining = 1
              houseBetFirstTargetSignal = true
              log(
                `TARGET HIT! Best multi ${best.toFixed(2)}x (target: ${targetM.toFixed(2)}x) — houseBets/state · one extra spin for round/challenge finalization`
              )
              if (!challengeHitPersisted) {
                persistChallengeHitRecord({
                  challengeId,
                  roundId: null,
                  slotSlug: gSlug,
                  slotName: gName,
                  targetMultiplier: targetM,
                  hitMulti: best,
                  currency: tCurr,
                })
                challengeHitPersisted = true
                log('Hit saved (houseBets/state; round ID may follow HTTP spin).')
              }
            }
          }
        }

        try {
          trimPendingQueues(pendingHouseBetMatchRef.current, 80)

          const result = await provider.placeBet(session, betAmount, false, false, { slotSlug: gSlug })
          const { data, nextSeq, session: updatedSession } = result || {}
          session = updatedSession ? updatedSession : session ? { ...session, seq: nextSeq } : session
          sessionTimeoutRecoveryAttempts = 0

          let parsed = data ? parseBetResponse(data, betAmount) : { winAmount: 0, balance: null }
          const winMinorSe = data?._stakeEngine?.winMinor
          if (winMinorSe !== undefined && winMinorSe !== null) {
            const w = Number(winMinorSe)
            if (Number.isFinite(w)) {
              parsed = {
                ...parsed,
                winAmount: w,
                multiplier: betAmount > 0 ? w / betAmount : parsed.multiplier,
              }
            }
          }
          const win = parsed.winAmount || 0
          const rawRound = data?._stakeEngine?.raw?.round
          const payoutMultRaw = Number(rawRound?.payoutMultiplier ?? rawRound?.payout_multiplier ?? 0)
          const betN = Number(betAmount) || 0
          const impliedMulti = betN > 0 && (parsed.winAmount || 0) > 0 ? parsed.winAmount / betN : 0
          const rawSafeMulti =
            impliedMulti > 0
              ? impliedMulti
              : effectiveSpinMultiplierFromParsed(payoutMultRaw, parsed)
          const safeMulti = normalizeHunterMultiByProvider(rawSafeMulti, providerId)
          const multiForStop = (() => {
            let m = Number(safeMulti) || 0
            if (betN > 0 && win > 0) m = Math.max(m, win / betN)
            if (Number.isFinite(payoutMultRaw) && payoutMultRaw > 0) {
              m = Math.max(m, normalizeHunterMultiByProvider(payoutMultRaw, providerId))
            }
            const pm = Number(parsed?.multiplier)
            if (Number.isFinite(pm) && pm > 0) {
              m = Math.max(m, normalizeHunterMultiByProvider(pm, providerId))
            }
            return m
          })()

          const hubListCc = (parsed.currencyCode || tCurr || 'usd').toUpperCase()
          const hubListBet = betAmount
          const hubListWinDb = win

          const spinSeq =
            (hunterSpinSeqByRunRef.current[runId] = (hunterSpinSeqByRunRef.current[runId] || 0) + 1)
          const roundIdForDedup =
            parsed?.roundId != null
              ? String(parsed.roundId)
              : rawRound?.betID != null
                ? String(rawRound.betID)
                : rawRound?.roundId != null
                  ? String(rawRound.roundId)
                  : rawRound?.id != null
                    ? String(rawRound.id)
                    : rawRound?.betId != null
                      ? String(rawRound.betId)
                      : null
          const runSeenRounds = (seenRoundKeysByRunRef.current[runId] ||= new Set())
          const dedupKey = roundIdForDedup ? `round:${roundIdForDedup}` : `spin:${spinSeq}`
          if (runSeenRounds.has(dedupKey)) {
            log(`Duplicate spin row ignored (${gName || gSlug} · ${dedupKey}).`)
            await new Promise((r) => setTimeout(r, HUNTER_SPIN_DELAY_MS))
            continue
          }
          runSeenRounds.add(dedupKey)
          const seenOrder = (seenRoundOrderByRunRef.current[runId] ||= [])
          seenOrder.push(dedupKey)
          while (seenOrder.length > HUNTER_SEEN_ROUND_DEDUP_MAX) {
            const oldK = seenOrder.shift()
            if (oldK != null) runSeenRounds.delete(oldK)
          }

          const kpi = hunterSpinKpiUsdDeltas(betAmount, win, tCurr, rates)
          if (kpi) {
            const ts = totalSessionStatsRef.current
            totalSessionStatsRef.current = {
              wagered: ts.wagered + kpi.wagered,
              payout: ts.payout + kpi.payout,
              profit: ts.profit + kpi.profit,
            }
            totalStatsRef.current = totalSessionStatsRef.current
            sessionStatsUiDirtyRef.current = true
            scheduleActiveRunsUiFlush()
            if (ENABLE_SESSION_NET_CHART) {
              sessionNetTotalSpinsRef.current += 1
              sessionNetBufferRef.current.push(totalSessionStatsRef.current.profit)
              scheduleSessionNetChartFlush()
            }
          }

          // houseBets-Matching: Pending mit HTTP-Multi; UI-Best-Multi erst nach houseBets (oder Fallback).
          const matchEntry = {
            runId,
            challengeId,
            slug: normalizeBetSlugForHouseMatch(gSlug),
            storageSlug: gSlug,
            providerBetId: String(
              rawRound?.betId ??
              rawRound?.id ??
              rawRound?.roundId ??
              rawRound?.betID ??
              ''
            ).trim() || null,
            currency: String(tCurr).toLowerCase(),
            betAmountMajor: toUnits(betAmount, tCurr),
            at: Date.now(),
            multi: multiForStop,
            spinSeq,
            feedEntryId: `${runId}:${spinSeq}`,
          }
          {
            const pmap = pendingHouseBetMatchRef.current
            const rid = String(matchEntry.runId || '')
            if (!pmap[rid]) pmap[rid] = []
            pmap[rid].push(matchEntry)
          }
          flushHouseBetRetryBufferForSlug(
            houseBetRetryBufferRef,
            houseBetEventQueueRef,
            normalizeBetSlugForHouseMatch(gSlug),
            () => scheduleHouseBetWorkerRef.current?.()
          )

          {
            const dk = `${runId}:${spinSeq}`
            const prevTid = houseBetDeferredUiTimersRef.current.get(dk)
            if (prevTid != null) clearTimeout(prevTid)
            const tid = setTimeout(() => {
              houseBetDeferredUiTimersRef.current.delete(dk)
              setBestMultiBySlotRef.current((prev) => {
                const cur = prev[gSlug] ?? 0
                if (multiForStop <= cur) return prev
                const nmap = { ...prev, [gSlug]: multiForStop }
                persistBestMultiMap(nmap)
                return nmap
              })
              patchActiveRunInRef(runId, {
                bestMultiRun: Math.max(
                  activeRunsRef.current?.[runId]?.bestMultiRun ?? 0,
                  multiForStop
                ),
              })
              scheduleActiveRunsUiFlush()
              const prevS = runBestMultiSyncRef.current[runId] ?? 0
              runBestMultiSyncRef.current[runId] = Math.max(Number(prevS) || 0, multiForStop)
              try {
                const curFeed = getChallengeHubRecentBets()
                const curRow = curFeed.find((x) => String(x?.id ?? '') === dk)
                if (curRow && curRow.hubSettlement === 'pending') {
                  const deferredWin =
                    win > 0 ? win : Math.max(0, Math.round(Number(hubListBet) * Number(multiForStop)))
                  publishChallengeHubBet({
                    id: dk,
                    slotSlug: gSlug,
                    slotName: gName,
                    betAmount: hubListBet,
                    winAmount: deferredWin,
                    multiplier: multiForStop,
                    currencyCode: hubListCc,
                    hubSettlement: 'settled',
                    settlementSource: 'http_deferred',
                    sourceTag: `casino:${gSlug}`,
                  })
                }
              } catch (_) {}
            }, HOUSEBET_DEFERRED_UI_MULTI_MS)
            houseBetDeferredUiTimersRef.current.set(dk, tid)
          }

          // RoundId für "Beste Multi" Kopieren (nicht nur wenn Ziel erreicht ist)
          const resolvedRoundId = roundIdForDedup
          const mappedShareId =
            matchEntry.providerBetId &&
            houseShareIdByProviderBetIdRef.current.get(matchEntry.providerBetId)
          const provisionalRunBetId =
            mappedShareId ||
            formatStakeShareBetId(matchEntry.providerBetId || resolvedRoundId || null)

          if (win > 0) {
            void saveFirstSlotWinIfNeeded({
              slotSlug: gSlug,
              slotName: gName,
              providerId: slot.providerId,
              providerGroupSlug: challenge.providerGroupSlug ?? extractProviderGroupSlug(challenge.game),
              betAmountMinor: betAmount,
              winAmountMinor: win,
              currency: tCurr,
              multiplier: safeMulti,
              roundId: resolvedRoundId,
              shareBetId: null,
              betAmountApiRaw: data?._stakeEngine?.betAmountApiRaw ?? null,
              payoutApiRaw: data?._stakeEngine?.payoutApiRaw ?? null,
              payoutFromMultiplierApiRaw: data?._stakeEngine?.payoutFromMultiplierApiRaw ?? null,
            }).then((r) => {
              if (r?.saved) {
                const parts = [r.path, r.csvPath, r.slotCsvPath].filter(Boolean)
                log(
                  `First win saved: ${gName || gSlug}${parts.length ? ` → ${parts.join(' | ')}` : ''}`
                )
              }
            })
          }

          {
            const prevRun = activeRunsRef.current?.[runId]
            if (prevRun) {
              patchActiveRunInRef(runId, {
                spins: (prevRun.spins || 0) + 1,
                wagered: (prevRun.wagered || 0) + betAmount,
                wageredUsd: (prevRun.wageredUsd ?? 0) + (kpi?.wagered ?? 0),
                wonUsd: (prevRun.wonUsd ?? 0) + (kpi?.profit ?? 0),
                balance: parsed.balance,
                bestMultiRun: prevRun.bestMultiRun ?? 0,
                bestBetId: prevRun.bestBetId ?? provisionalRunBetId ?? null,
              })
              scheduleActiveRunsUiFlush({ immediate: true })
            }
          }

          queueHunterBetHistory(
            gSlug,
            {
              betAmount: hubListBet,
              winAmount: hubListWinDb,
              isBonus: false,
              balance: parsed.balance,
              currencyCode: hubListCc,
              roundId: resolvedRoundId ?? undefined,
            },
            gName
          )
          publishChallengeHubBet({
            id: `${runId}:${spinSeq}`,
            slotSlug: gSlug,
            slotName: gName,
            betAmount: hubListBet,
            winAmount: 0,
            currencyCode: hubListCc,
            roundId: resolvedRoundId ?? null,
            sourceTag: `casino:${gSlug}`,
            hubSettlement: 'pending',
          })

          const multi = multiForStop
          if (targetOk && multi >= targetM) {
            if (!targetHit) {
              targetHit = true
              finalizeSpinsRemaining = 1
              targetDetectedThisLoop = true
              log(`TARGET HIT! Multi: ${multi.toFixed(2)}x (target: ${targetM.toFixed(2)}x) — one extra spin for round/challenge finalization`)
            }
            const rawR = data?._stakeEngine?.raw?.round
            const roundId =
              parsed.roundId != null
                ? String(parsed.roundId)
                : rawR?.roundId != null
                  ? String(rawR.roundId)
                  : rawR?.id != null
                    ? String(rawR.id)
                    : rawR?.betId != null
                      ? String(rawR.betId)
                      : null
            log(
              'Target hit — bet ID for share link comes from houseBets (WebSocket); use Copy ID on the run card'
            )
            if (!challengeHitPersisted) {
              persistChallengeHitRecord({
                challengeId,
                roundId,
                slotSlug: gSlug,
                slotName: gName,
                targetMultiplier: targetM,
                hitMulti: multi,
                currency: tCurr,
              })
              challengeHitPersisted = true
              log(`Hit saved (bet history + list): round ${roundId ?? '—'}`)
            }
          }

          const seedEveryNow = isStakeRgsRun
            ? Math.max(
                0,
                Math.min(
                  100000,
                  parseInt(String(activeRunsRef.current?.[runId]?.stakeRgsSeedResetEvery || 0), 10) || 0
                )
              )
            : 0
          if (seedEveryNow > 0) {
            stakeRgsSpinsSinceSeedReset += 1
            if (stakeRgsSpinsSinceSeedReset >= seedEveryNow) {
              const rawRoundForFairness = data?._stakeEngine?.raw?.round
              const seedResetDeferred =
                isStakeRgsRun && skipStakeEngineEndRoundAfterSuccessfulPlay(rawRoundForFairness)
              if (seedResetDeferred) {
                stakeRgsSpinsSinceSeedReset -= 1
                log(
                  `Stake-RGS Seed Reset verschoben: Runde noch offen (Bonus/FS) — erst wenn Basis-Runde mit end-round fertig ist (${gName || gSlug})`
                )
              } else {
                const seedSwitchErrText = (err) => {
                  if (err == null) return 'unbekannt'
                  if (typeof err === 'string') return err
                  if (typeof err === 'number' || typeof err === 'boolean') return String(err)
                  if (err instanceof Error) return err.message || String(err)
                  const m = err?.message
                  if (m != null) return String(m)
                  try {
                    return JSON.stringify(err)
                  } catch {
                    return String(err)
                  }
                }
                let seedSwitchOk = false
                let lastSeedSwitchErr = ''
                for (let seedAttempt = 0; seedAttempt < STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS; seedAttempt++) {
                  try {
                    if (seedAttempt === 0) {
                      log(`Stake RGS seed reset after ${stakeRgsSpinsSinceSeedReset} spin(s) — ${gName || gSlug}`)
                      await new Promise((r) => setTimeout(r, STAKE_RGS_FAIRNESS_AFTER_SPIN_MS))
                    } else {
                      const backoffMs = SESSION_PROBE_DELAY_MS * seedAttempt + STAKE_RGS_FAIRNESS_AFTER_SPIN_MS
                      log(
                        `Stake RGS seed reset retry ${seedAttempt + 1}/${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} (after ${backoffMs} ms) — ${gName || gSlug}`
                      )
                      await new Promise((r) => setTimeout(r, backoffMs))
                    }
                    if (!stakeGameIdForFairness) {
                      throw new Error(
                        'No Stake game UUID (gameId) — refresh slots, or the challenge must provide game.id.'
                      )
                    }
                    let fairnessReferer
                    let fairnessLanguage
                    try {
                      const st = await window.electronAPI?.getStakeSessionStatus?.()
                      const origin = st?.origin
                      const locale =
                        typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
                      const langPart = String(locale).trim().toLowerCase().split('-')[0]
                      fairnessLanguage = /^[a-z]{2}$/.test(langPart) ? langPart : 'en'
                      if (origin && String(gSlug || '').trim()) {
                        fairnessReferer = buildStakeCasinoFairnessReferer(
                          origin,
                          locale,
                          gSlug,
                          stakeGameIdForFairness
                        )
                      }
                    } catch (_) {}
                    const rotated = await rotateStakeRgsGameSeed(stakeGameIdForFairness, undefined, {
                      referer: fairnessReferer,
                      language: fairnessLanguage,
                    })
                    if (!rotated?.ok) {
                      const rotMsg = seedSwitchErrText(rotated?.error)
                      throw new Error(rotMsg || 'rotateSeed without activeSeed')
                    }
                    const freshRate = getRateForCurrency(ratesRef.current || rates || {}, tCurr) || rate
                    if (!freshRate) throw new Error(`No rate for ${String(tCurr).toUpperCase()}`)
                    rate = freshRate
                    await new Promise((r) => setTimeout(r, SESSION_PROBE_DELAY_MS))
                    session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
                    noteSessionFairnessId(session)
                    const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
                    betAmount = computed.betAmount
                    setActiveRuns((prev) => ({
                      ...prev,
                      [runId]: {
                        ...prev[runId],
                        currentBet: betAmount,
                        runCurrency: tCurr,
                      },
                    }))
                    log(
                      `Seed rotated (RGS game ${stakeGameIdForFairness} · client ${rotated.seed ?? '—'}) · new session · ${String(tCurr).toUpperCase()} · stake ${formatAmount(betAmount, tCurr)}`
                    )
                    seedSwitchOk = true
                    break
                  } catch (seedErr) {
                    lastSeedSwitchErr = seedSwitchErrText(seedErr)
                    log(
                      `Stake RGS seed reset attempt ${seedAttempt + 1}/${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} failed: ${lastSeedSwitchErr}`
                    )
                  }
                }
                if (!seedSwitchOk) {
                  log(
                    `Stake RGS seed reset aborted after ${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} attempts: ${lastSeedSwitchErr || 'unknown'}`
                  )
                }
                stakeRgsSpinsSinceSeedReset = 0
              }
            }
          }

          if (targetHit && finalizeSpinsRemaining > 0) {
            if (houseBetFirstTargetSignal || !targetDetectedThisLoop) {
              finalizeSpinsRemaining -= 1
              if (finalizeSpinsRemaining === 0) {
                log('Final spin after target finished (RGS end-round / challenge state).')
              }
            }
          }

          await new Promise((r) => setTimeout(r, HUNTER_SPIN_DELAY_MS))

        } catch (e) {
          const msg = String(e?.message || '')
          log(`Spin error: ${msg}`)
          const msgLower = msg.toLowerCase()
          const insufficientFundsMsg =
            e?.insufficientBalance ||
            msg.includes('ERR_IPB') ||
            msgLower.includes('balance is less than bet') ||
            msgLower.includes('insufficient balance (truelab') ||
            /\bcode\s*[=:]?\s*10\b/.test(msgLower) ||
            (msgLower.includes('unable to create bet') && msgLower.includes('balance'))
          if (insufficientFundsMsg) {
            log('Insufficient balance — stopping all hunter runs and auto-start.')
            Object.keys(runnersRef.current).forEach((id) => {
              if (runnersRef.current[id]) runnersRef.current[id].stop = true
            })
            setAutoStart(false)
            setQueue([])
            processedIdsRef.current.clear()
            setHuntEnabled(false)
            stopReason = 'insufficient_balance'
            break
          }
          const isSessionTimeout =
            e?.sessionClosed === true ||
            msgLower.includes('session abgelaufen') ||
            msgLower.includes('session expired') ||
            msgLower.includes('session timeout') ||
            msgLower.includes('err_is') ||
            msgLower.includes('invalid session') ||
            (msgLower.includes('timeout') && (msgLower.includes('session') || msgLower.includes('rgs')))
          if (isSessionTimeout && sessionTimeoutRecoveryAttempts < SESSION_TIMEOUT_RECOVERY_MAX) {
            sessionTimeoutRecoveryAttempts += 1
            log(
              `Session/timeout — rebuild ${sessionTimeoutRecoveryAttempts}/${SESSION_TIMEOUT_RECOVERY_MAX} (waiting ${SESSION_TIMEOUT_RECOVERY_DELAY_MS / 1000}s)…`
            )
            await new Promise((r) => setTimeout(r, SESSION_TIMEOUT_RECOVERY_DELAY_MS))
            try {
              const freshRate = getRateForCurrency(rates, tCurr) || rate
              if (!freshRate) {
                log(`No rate for ${String(tCurr).toUpperCase()} — session recovery aborted.`)
              } else {
                rate = freshRate
                session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
                noteSessionFairnessId(session)
                const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
                betAmount = computed.betAmount
                setActiveRuns((prev) => ({
                  ...prev,
                  [runId]: {
                    ...prev[runId],
                    currentBet: betAmount,
                    runCurrency: tCurr,
                  },
                }))
                log(
                  `Session restarted · ${String(tCurr).toUpperCase()} · stake ${formatAmount(betAmount, tCurr)} (≈ $${computed.usdAt.toFixed(2)} USD)`
                )
                await new Promise((r) => setTimeout(r, SESSION_PROBE_DELAY_MS))
                continue
              }
            } catch (recoveryErr) {
              log(`Session rebuild failed: ${String(recoveryErr?.message || recoveryErr)}`)
            }
          }
          const providerKey = String(providerId || '').toLowerCase()
          const isPragmaticFamily =
            providerKey === 'pragmatic' ||
            providerKey === 'fat-panda' ||
            providerKey === 'sexy-rabbit' ||
            providerKey === 'sexyrabbit' ||
            providerKey === 'videoslots'
          const isSystemError =
            msgLower.includes('systemfehler') ||
            msgLower.includes('systemerror') ||
            msgLower.includes('spiel-server')
          if (isPragmaticFamily && isSystemError && pragmaticRecoveryAttempts < 2) {
            pragmaticRecoveryAttempts += 1
            try {
              log(`Pragmatic recovery #${pragmaticRecoveryAttempts}: restarting session (${sCurr.toUpperCase()} → ${tCurr.toUpperCase()}).`)
              session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
              noteSessionFairnessId(session)
              const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
              betAmount = computed.betAmount
              setActiveRuns((prev) => ({
                ...prev,
                [runId]: {
                  ...prev[runId],
                  currentBet: betAmount,
                  runCurrency: tCurr,
                },
              }))
              await new Promise((r) => setTimeout(r, 350))
              continue
            } catch (recoveryErr) {
              log(`Pragmatic recovery failed: ${String(recoveryErr?.message || recoveryErr)}`)
            }
          }
          await new Promise((r) => setTimeout(r, HUNTER_SPIN_ERROR_RETRY_MS))
        }
      }
      
      log('Challenge finished.')
      const status = challenge.completedAt ? 'completed' : targetHit ? 'target_hit' : (stopReason || 'stopped')
      patchActiveRunInRef(runId, { status })
      scheduleActiveRunsUiFlush({ immediate: true })

    } catch (e) {
      log(`Challenge start error: ${e.message}`)
      setActiveRuns((prev) => ({
        ...prev,
        [runId]: { ...prev[runId], status: 'failed' },
      }))
    } finally {
      delete runnersRef.current[runId]
      try {
        delete seenRoundKeysByRunRef.current[runId]
      } catch (_) {}
      try {
        delete seenRoundOrderByRunRef.current[runId]
      } catch (_) {}
      try {
        delete runBestMultiSyncRef.current[runId]
      } catch (_) {}
      try {
        delete hunterSpinSeqByRunRef.current[runId]
      } catch (_) {}
      try {
        const prefix = `${runId}:`
        for (const k of houseBetDeferredUiTimersRef.current.keys()) {
          if (String(k).startsWith(prefix)) {
            clearTimeout(houseBetDeferredUiTimersRef.current.get(k))
            houseBetDeferredUiTimersRef.current.delete(k)
          }
        }
      } catch (_) {}
    }
  }

  const stopAllRunners = () => {
    Object.keys(runnersRef.current).forEach((id) => {
      runnersRef.current[id].stop = true
    })
    for (const tid of houseBetDeferredUiTimersRef.current.values()) {
      clearTimeout(tid)
    }
    houseBetDeferredUiTimersRef.current.clear()
    setHuntEnabled(false)
    setAutoStart(false)
    setQueue([])
    processedIdsRef.current.clear()
    dismissedChallengeIdsRef.current.clear()
    clearHunterState()
    houseShareIdByProviderBetIdRef.current.clear()
    void flushHunterBetHistory()
    log('All stopped: active spins, scan, auto-start off, queue cleared.')
  }

  const resetSession = () => {
    Object.keys(runnersRef.current).forEach(id => {
      runnersRef.current[id].stop = true
    })
    for (const tid of houseBetDeferredUiTimersRef.current.values()) {
      clearTimeout(tid)
    }
    houseBetDeferredUiTimersRef.current.clear()
    runnersRef.current = {}
    processedIdsRef.current.clear()
    dismissedChallengeIdsRef.current.clear()
    clearHunterState()
    houseShareIdByProviderBetIdRef.current.clear()
    clearHunterBetHistoryBuffer()
    void flushHunterBetHistory()
    setQueue([])
    setActiveRuns({})
    activeRunsRef.current = {}
    setHunterSlotTargets({})
    const emptyStats = { wagered: 0, payout: 0, profit: 0 }
    totalSessionStatsRef.current = emptyStats
    totalStatsRef.current = emptyStats
    setTotalSessionStats(emptyStats)
    if (ENABLE_SESSION_NET_CHART) {
      sessionNetBufferRef.current.reset()
      sessionNetTotalSpinsRef.current = 0
      setSessionNetSeriesVersion((v) => v + 1)
      setSessionNetSpinCount(0)
    }
    setAutoStart(false)
    setHuntEnabled(false)
    setLastRefresh(null)
  }

  const clearLogs = () => {
    logBufferRef.current = []
    if (logFlushTimerRef.current) {
      clearTimeout(logFlushTimerRef.current)
      logFlushTimerRef.current = null
    }
    setLogs([])
  }

  const startAllRunners = () => {
    setAutoStart(true)
    if (!huntEnabled) setHuntEnabled(true)
    if (queue.length === 0 && runningCount === 0) {
      processedIdsRef.current.clear()
      dismissedChallengeIdsRef.current.clear()
      clearHunterState()
      refreshChallenges()
    }
  }

  /** Einen Lauf aus der Warteschlange starten — ohne Scan & ohne Auto-Start (reine Handsteuerung). */
  const startNextQueuedManually = () => {
    if (queue.length === 0) {
      log('Queue is empty.')
      return
    }
    if (runningCount >= maxParallelClamped) {
      log(`Already ${maxParallelClamped} runs in parallel — wait for a free slot or stop a run.`)
      return
    }
    const nextId = queue[0]
    setQueue((q) => q.slice(1))
    startChallengeRun(nextId)
    log('Next challenge from queue started (manual).')
  }

  /** Ein laufender Run: Flag setzen — Schleife bricht nach dem aktuell laufenden Spin ab (nicht mitten in placeBet). */
  const stopRunByRunId = useCallback((runId) => {
    if (runnersRef.current[runId]) {
      runnersRef.current[runId].stop = true
    }
  }, [])

  /** Alle aktiven Läufe zu einer Challenge (z. B. mehrere Zielwährungen) — jeweils nach aktuellem Spin. */
  const stopRunsForChallenge = useCallback(
    (challengeId) => {
      const runs = Object.values(activeRunsRef.current).filter(
        (r) => r.challengeId === challengeId && r.status === 'running'
      )
      for (const r of runs) {
        const rid = r.runId
        if (rid && runnersRef.current[rid]) {
          runnersRef.current[rid].stop = true
        }
      }
      if (runs.length === 1) {
        log('Stop after current spin: 1 parallel run of this challenge.')
      } else if (runs.length > 1) {
        log(`Stop after current spin: ${runs.length} parallel runs of this challenge.`)
      }
    },
    [log]
  )

  const restartRunByRunId = useCallback(
    (runId) => {
      const run = activeRunsRef.current?.[runId]
      if (!run?.challengeId) return
      const nextQueueItem = {
        runId: generateHunterRunId(),
        challengeId: run.challengeId,
        currencySlotIndex: Number.isFinite(Number(run.currencySlotIndex)) ? Number(run.currencySlotIndex) : 0,
        sourceCurrency: run.runSourceCurrency ? String(run.runSourceCurrency).toLowerCase() : sourceCurrency,
        slotSlug: run.slotSlug ? String(run.slotSlug).toLowerCase() : null,
        ...(run.forcedTargetCurrency ? { forcedTargetCurrency: String(run.forcedTargetCurrency).toLowerCase() } : {}),
      }

      // Remove old finished run card before starting/re-queueing.
      setActiveRuns((prev) => {
        const next = { ...prev }
        delete next[runId]
        return next
      })
      try {
        delete runBestMultiSyncRef.current[runId]
      } catch (_) {}
      try {
        delete hunterSpinSeqByRunRef.current[runId]
      } catch (_) {}
      dismissedChallengeIdsRef.current.delete(run.challengeId)
      processedIdsRef.current.add(run.challengeId)

      if (runningCount < maxParallelClamped) {
        void startChallengeRun(nextQueueItem)
        log(`Run restarted: ${run.slotName || run.challengeId}`)
        return
      }
      setQueue((q) => [...q, nextQueueItem])
      log(`Run re-queued: ${run.slotName || run.challengeId}`)
    },
    [log, maxParallelClamped, runningCount]
  )

  const removeRun = (runId) => {
    const snap = activeRunsRef.current[runId]
    const cid = snap?.challengeId
    if (runnersRef.current[runId]) {
      runnersRef.current[runId].stop = true
      delete runnersRef.current[runId]
    }
    setActiveRuns((prev) => {
      const next = { ...prev }
      delete next[runId]
      return next
    })
    setQueue((q) => q.filter((item) => normalizeQueueItem(item).runId !== runId))
    setTimeout(() => {
      if (!cid) return
      const anyOther =
        queueRef.current.some((x) => normalizeQueueItem(x).challengeId === cid) ||
        Object.values(activeRunsRef.current).some((r) => r.challengeId === cid)
      if (!anyOther) {
        dismissedChallengeIdsRef.current.add(cid)
        processedIdsRef.current.delete(cid)
      }
    }, 0)
  }

  const renderChallengeCard = (c, inQueue = false, metaOverride = null, showReasons = false, queueItem = null) => {
    const meta = metaOverride || getChallengeMeta(c)
    const { main: prizeMain, hint: prizeHint } = formatChallengePrize(c)
    const runningCountForC = runningCountByChallengeId[c.id] || 0
    const isRunning = runningCountForC > 0
    const hasFinishedRun = (finishedCountByChallengeId[c.id] || 0) > 0
    const queueCountForC = queueCountByChallengeId[c.id] || 0
    const inQueueLocal = queueCountForC > 0
    const stakeClosed = !!(c.completedAt || c.active === false)
    const canQueue = !stakeClosed
    const filterEligible = meta.eligible
    const badges = []
    if (showReasons) {
      if (!meta.isSlotOk) badges.push('Unavailable')
      if (!meta.isMinBetOk) badges.push('Min bet filter')
      if (!meta.isPrizeOk) badges.push('Prize filter')
      if (c.completedAt || c.active === false) badges.push('Stake: closed')
      if (inQueueLocal) badges.push(`Queued${queueCountForC > 1 ? ` (${queueCountForC})` : ''}`)
      if (isRunning) badges.push(runningCountForC > 1 ? `Running (${runningCountForC})` : 'Running')
      else if (hasFinishedRun) badges.push('Run finished')
    }

    const qMeta = queueItem ? normalizeQueueItem(queueItem) : null
    const copyHint =
      qMeta && qMeta.currencySlotIndex > 0 ? ` → Target #${qMeta.currencySlotIndex + 1}` : ''

    return (
      <div 
        key={inQueue && qMeta ? `${c.id}-${qMeta.runId}` : c.id} 
        className={inQueue ? 'hunter-queue-item' : 'hunter-card hunter-challenge-card'}
        style={
          !inQueue && canQueue && !filterEligible
            ? { borderStyle: 'dashed', borderColor: 'rgba(251, 191, 36, 0.55)' }
            : undefined
        }
        title={
          canQueue
            ? filterEligible
              ? 'Click to queue (multiple clicks = next target currency with auto target)'
              : 'Click to queue (fails min/prize filters but still allowed)'
            : stakeClosed
              ? 'Challenge closed on Stake'
              : ''
        }
        onClick={() => {
          if (inQueue) return
          if (!canQueue) return
          dismissedChallengeIdsRef.current.delete(c.id)
          const cSlug = String(c.gameSlug || c.game?.slug || '').toLowerCase()
          const manual = (manualTargetCurrencyByChallengeId[c.id] || '').trim().toLowerCase()
          setQueue((q) => [...q, buildQueueItemForChallenge(c.id, q, manual || null, sourceCurrency, cSlug)])
          processedIdsRef.current.add(c.id)
        }}
      >
        <div style={{fontWeight: 600, marginBottom: '0.25rem'}}>
          {c.gameName || c.gameSlug || c.game?.name || c.game?.slug}
          {copyHint ? (
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>{copyHint}</span>
          ) : null}
        </div>
        <div style={STYLES.statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Target Multi</span>
          <span style={{ fontWeight: 600 }}>{c.targetMultiplier}×</span>
        </div>
        <div style={STYLES.statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Potential Prize</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prizeMain}</span>
            {prizeHint ? (
              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                {prizeHint}
              </span>
            ) : null}
          </span>
        </div>
        <div style={STYLES.statRow}>
          <span
            style={{ color: 'var(--text-muted)' }}
            title="Challenge minimum stake on Stake in USD (not your converted local stake)"
          >
            Challenge-Min: ${c.minBetUsd}
          </span>
          {!meta.isSlotOk && <span style={{color: 'var(--error)'}}>Unavailable</span>}
          {isRunning && <span style={{color: 'var(--accent)'}}>Running ...</span>}
          {hasFinishedRun && !isRunning && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Run done</span>
          )}
        </div>
        {!inQueue && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.35rem' }}
          >
            <label
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: '0.12rem',
              }}
            >
              Target (slot)
            </label>
            <select
              value={manualTargetCurrencyByChallengeId[c.id] ?? ''}
              onChange={(e) => {
                e.stopPropagation()
                const v = e.target.value
                setManualTargetCurrencyByChallengeId((prev) => ({ ...prev, [c.id]: v }))
              }}
              style={{
                width: '100%',
                fontSize: '0.72rem',
                padding: '0.25rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-deep)',
                color: 'var(--text)',
              }}
            >
              <option value="">Auto (ranked/probed)</option>
              {hunterTargetCurrencyOptions.map((cc) => (
                <option key={cc} value={cc}>
                  {cc.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
        {inQueue && qMeta && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.35rem' }}
          >
            <label
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: '0.12rem',
              }}
            >
              Target
            </label>
            <select
              value={qMeta.forcedTargetCurrency || ''}
              onChange={(e) => {
                e.stopPropagation()
                const v = e.target.value.trim().toLowerCase()
                setQueue((q) =>
                  q.map((item) => {
                    const n = normalizeQueueItem(item)
                    if (n.runId !== qMeta.runId) return item
                    return { ...item, forcedTargetCurrency: v || null }
                  })
                )
              }}
              style={{
                width: '100%',
                fontSize: '0.72rem',
                padding: '0.25rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-deep)',
                color: 'var(--text)',
              }}
            >
              <option value="">Auto</option>
              {hunterTargetCurrencyOptions.map((cc) => (
                <option key={cc} value={cc}>
                  {cc.toUpperCase()}
                </option>
              ))}
            </select>
            {(() => {
              const slug = String(c.gameSlug || c.game?.slug || '').toLowerCase()
              const slotRow = (webSlots || []).find((s) => String(s.slug || '').toLowerCase() === slug)
              const pid = String(slotRow?.providerId || c.game?.providerId || 'stakeEngine').toLowerCase()
              if (pid !== 'stakeengine') return null
              const seedVal = Number(qMeta.stakeRgsSeedResetEvery) || 0
              return (
                <div style={{ marginTop: '0.35rem' }}>
                  <label
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: '0.12rem',
                    }}
                  >
                    Seed-Reset (Stake-RGS)
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      flexWrap: 'wrap',
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>every</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={seedVal}
                      onChange={(e) => {
                        e.stopPropagation()
                        const nextN = Math.max(
                          0,
                          Math.min(100000, parseInt(e.target.value || '0', 10) || 0)
                        )
                        setQueue((q) =>
                          q.map((item) => {
                            const n = normalizeQueueItem(item)
                            if (n.runId !== qMeta.runId) return item
                            if (item && typeof item === 'object' && item.runId) {
                              return { ...item, stakeRgsSeedResetEvery: nextN }
                            }
                            return { ...n, stakeRgsSeedResetEvery: nextN }
                          })
                        )
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: '3.6rem',
                        padding: '0.12rem 0.25rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-deep)',
                        color: 'var(--text)',
                        fontSize: '0.72rem',
                        textAlign: 'right',
                      }}
                      title="0 = off. Value is applied when run starts (onChange, no Enter required)."
                    />
                    <span>Spins</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
        {(() => {
          const slug = c.gameSlug || c.game?.slug
          const rec = slug && bestMultiBySlot[slug] != null ? bestMultiBySlot[slug] : null
          if (rec == null || rec <= 0) return null
          return (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Best multi so far: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rec.toFixed(2)}×</span>
            </div>
          )
        })()}
        {showReasons && badges.length > 0 && (
          <div style={{ ...STYLES.statRow, color: 'var(--text-muted)' }}>
            <span>{badges.join(' · ')}</span>
          </div>
        )}
        {canQueue && !filterEligible && showReasons && (
          <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: '0.2rem' }}>
            Filter mismatch (min/prize) — still queueable
          </div>
        )}
        {isRunning && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.4rem' }}
          >
            <Button
              size="small"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                stopRunsForChallenge(c.id)
              }}
              title="Stop after current spin for each parallel run of this challenge"
            >
              Stop after spin
            </Button>
          </div>
        )}
        {inQueue && qMeta && (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setQueue((q) => {
                const next = q.filter((item) => normalizeQueueItem(item).runId !== qMeta.runId)
                const still = next.some((item) => normalizeQueueItem(item).challengeId === c.id)
                if (!still) processedIdsRef.current.delete(c.id)
                return next
              })
            }}
          >
            Remove
          </Button>
        )}
        {!inQueue && inQueueLocal && (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setQueue((q) => {
                const next = q.filter((item) => normalizeQueueItem(item).challengeId !== c.id)
                processedIdsRef.current.delete(c.id)
                return next
              })
            }}
          >
            Clear queue
          </Button>
        )}
      </div>
    )
  }

  const renderFoundChallengeRow = (c, metaOverride = null) => {
    const meta = metaOverride || getChallengeMeta(c)
    const { main: prizeMain } = formatChallengePrize(c)
    const queueCountForC = queueCountByChallengeId[c.id] || 0
    const inQueueLocal = queueCountForC > 0
    const runningCountForC = runningCountByChallengeId[c.id] || 0
    const stakeClosed = !!(c.completedAt || c.active === false)
    const canQueue = !stakeClosed
    const slotName = c.gameName || c.gameSlug || c.game?.name || c.game?.slug
    const manual = (manualTargetCurrencyByChallengeId[c.id] || '').trim().toLowerCase()
    const statusLabel = stakeClosed
      ? 'closed'
      : runningCountForC > 0
        ? `running (${runningCountForC})`
        : inQueueLocal
          ? `queued${queueCountForC > 1 ? ` (${queueCountForC})` : ''}`
          : meta.eligible
            ? 'ready'
            : 'filter-mismatch'

    return (
      <div
        key={c.id}
        className={
          prefersReducedMotion ? 'hunter-found-row hunter-found-row--reduce-motion' : 'hunter-found-row'
        }
        onClick={() => {
          if (!canQueue) return
          dismissedChallengeIdsRef.current.delete(c.id)
          const cSlug = String(c.gameSlug || c.game?.slug || '').toLowerCase()
          setQueue((q) => [...q, buildQueueItemForChallenge(c.id, q, manual || null, sourceCurrency, cSlug)])
          processedIdsRef.current.add(c.id)
        }}
        title={canQueue ? 'Click row to add challenge to queue' : 'Challenge closed on Stake'}
      >
        <div className="hunter-found-col hunter-found-name">
          <div className="hunter-found-title">{slotName}</div>
          <div className="hunter-found-sub">{String(c.gameSlug || c.game?.slug || '').toLowerCase()}</div>
        </div>
        <div className="hunter-found-col">
          <div className="hunter-found-key">Target</div>
          <div className="hunter-found-val">{Number(c.targetMultiplier || 0).toFixed(2)}x</div>
        </div>
        <div className="hunter-found-col">
          <div className="hunter-found-key">Min Bet</div>
          <div className="hunter-found-val">${Number(c.minBetUsd || 0).toFixed(2)}</div>
        </div>
        <div className="hunter-found-col">
          <div className="hunter-found-key">Prize</div>
          <div className="hunter-found-val">{prizeMain}</div>
        </div>
        <div className="hunter-found-col">
          <div className="hunter-found-key">Status</div>
          <div className="hunter-found-val">{statusLabel}</div>
        </div>
        <div
          className="hunter-found-actions"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <select
            value={manualTargetCurrencyByChallengeId[c.id] ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setManualTargetCurrencyByChallengeId((prev) => ({ ...prev, [c.id]: v }))
            }}
            style={{
              width: '100%',
              fontSize: '0.7rem',
              padding: '0.22rem 0.3rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-deep)',
              color: 'var(--text)',
            }}
          >
            <option value="">Auto</option>
            {hunterTargetCurrencyOptions.map((cc) => (
              <option key={cc} value={cc}>
                {cc.toUpperCase()}
              </option>
            ))}
          </select>
          <Button
            size="small"
            variant="primary"
            disabled={!canQueue}
            onClick={() => {
              if (!canQueue) return
              dismissedChallengeIdsRef.current.delete(c.id)
              const cSlug = String(c.gameSlug || c.game?.slug || '').toLowerCase()
              setQueue((q) => [...q, buildQueueItemForChallenge(c.id, q, manual || null, sourceCurrency, cSlug)])
              processedIdsRef.current.add(c.id)
            }}
            title={canQueue ? 'Add challenge to queue' : 'Challenge closed'}
          >
            Queue
          </Button>
        </div>
      </div>
    )
  }

  const visibleChallenges = useMemo(() => {
    const q = String(challengeSearch || '').trim().toLowerCase()
    if (!q) return challenges
    return challenges.filter((c) => {
      const name = String(c?.gameName || c?.game?.name || '').toLowerCase()
      const slug = String(c?.gameSlug || c?.game?.slug || '').toLowerCase()
      return name.includes(q) || slug.includes(q)
    })
  }, [challengeSearch, challenges])

  const sortedFoundChallenges = useMemo(() => {
    const list = [...visibleChallenges]
    const getNum = (value, fallback) => {
      const n = Number(value)
      return Number.isFinite(n) ? n : fallback
    }
    if (challengeSort === 'prize-asc') {
      return list.sort((a, b) => getNum(a?.award, Number.POSITIVE_INFINITY) - getNum(b?.award, Number.POSITIVE_INFINITY))
    }
    if (challengeSort === 'prize-desc') {
      return list.sort((a, b) => getNum(b?.award, Number.NEGATIVE_INFINITY) - getNum(a?.award, Number.NEGATIVE_INFINITY))
    }
    if (challengeSort === 'stake-asc') {
      return list.sort((a, b) => getNum(a?.minBetUsd, Number.POSITIVE_INFINITY) - getNum(b?.minBetUsd, Number.POSITIVE_INFINITY))
    }
    if (challengeSort === 'stake-desc') {
      return list.sort((a, b) => getNum(b?.minBetUsd, Number.NEGATIVE_INFINITY) - getNum(a?.minBetUsd, Number.NEGATIVE_INFINITY))
    }
    return list
  }, [visibleChallenges, challengeSort])
  const localChallengeSlotOptions = useMemo(() => {
    const q = String(localChallengeSlotSearch || '').trim().toLowerCase()
    return (webSlots || [])
      .filter((s) => {
        if (!q) return true
        const name = String(s?.name || '').toLowerCase()
        const slug = String(s?.slug || '').toLowerCase()
        return name.includes(q) || slug.includes(q)
      })
      .slice()
      .sort((a, b) => String(a?.name || a?.slug || '').localeCompare(String(b?.name || b?.slug || '')))
  }, [webSlots, localChallengeSlotSearch])
  const foundRowVirtualizer = useVirtualizer({
    count: sortedFoundChallenges.length,
    getScrollElement: () => foundScrollRef.current,
    estimateSize: () => 74,
    overscan: 6,
  })

  return (
    <div className="hunter-dashboard" style={STYLES.container}>
      <div className="hunter-header">
        <div className="hunter-title">Casino Challenge Ops</div>
        <div className="hunter-controls">
           <div className="hunter-meta" style={{ marginRight: '1rem' }}>
             {lastRefresh ? `Updated: ${new Date(lastRefresh).toLocaleTimeString()}` : ''}
           </div>
           <Button onClick={clearLogs} variant="outline">Clear</Button>
           <Button
             onClick={resetSession}
             variant="outline"
             title="Reset queue, session stats, and scan state"
           >
             Reset
           </Button>
           <Button onClick={refreshChallenges} variant="primary" disabled={!accessToken} title="Reload challenge list now">
             Refresh
           </Button>
           <Button
             variant={huntEnabled ? 'secondary' : 'outline'}
             onClick={() => setHuntEnabled(!huntEnabled)}
             title={huntEnabled ? 'Stop automatic challenge scanning' : 'Enable automatic challenge scanning'}
           >
             {huntEnabled ? 'Scan On' : 'Scan Off'}
           </Button>
           {huntEnabled && (
             <Button
               variant={autoStart ? 'secondary' : 'outline'}
               onClick={() => setAutoStart(!autoStart)}
               title={autoStart ? 'Pause queue auto-start' : 'Process queue automatically when a slot is free'}
             >
               {autoStart ? 'Auto On' : 'Auto Off'}
             </Button>
           )}
           <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
             <TipMenu />
           </div>
        </div>
      </div>

      <div className="hunter-grid">
        <div className="hunter-sidebar">
          <div className="hunter-ops-surface">
          <div className="hunter-card hunter-ops-panel">
            <div className="hunter-ops-shell-head">
              <h3 className="hunter-section-title" style={{ marginBottom: '0.35rem' }}>Settings</h3>
              <p className="hunter-ops-shell-copy">
                Local settings are saved on this device.
              </p>
            </div>
            <div className="hunter-ops-accordion">
              <section className="hunter-ops-section">
                <button
                  type="button"
                  className="hunter-ops-section-head"
                  onClick={() => setOpsSectionsOpen((prev) => ({ ...prev, presets: !prev.presets }))}
                >
                  <span>Presets & Filters</span>
                  <span>{opsSectionsOpen.presets ? '−' : '+'}</span>
                </button>
                {opsSectionsOpen.presets ? (
                  <div className="hunter-ops-section-body">
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', lineHeight: 1.35 }}>
                      Filters and currency preferences are stored locally on this device.
                    </p>
                    <div style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Presets</label>
                      <select
                        value={presetSelectValue}
                        onChange={(e) => {
                          const v = e.target.value
                          setPresetSelectValue(v)
                          if (v) loadPresetById(v)
                        }}
                        style={{ ...STYLES.input, width: '100%' }}
                      >
                        <option value="">— Select preset —</option>
                        {userPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.3 }}>
                        Presets are stored locally.
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <input
                        type="text"
                        placeholder="Preset name"
                        value={presetNameDraft}
                        onChange={(e) => setPresetNameDraft(e.target.value)}
                        style={{ ...STYLES.input, flex: '1 1 120px', minWidth: 0, fontSize: '0.8rem' }}
                      />
                      <button type="button" onClick={saveCurrentPreset} className="hunter-ops-mini-btn">
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedUserPreset}
                        disabled={!userPresets.some((p) => p.id === presetSelectValue)}
                        title="Delete selected preset"
                        className="hunter-ops-mini-btn"
                        style={{ opacity: userPresets.some((p) => p.id === presetSelectValue) ? 1 : 0.5 }}
                      >
                        Delete
                      </button>
                    </div>
                    <button type="button" onClick={restoreDefaultFilters} className="hunter-ops-mini-btn">
                      Restore defaults
                    </button>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Min Bet Range ($)</label>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem'}}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Min"
                          value={minMinBet}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            setMinMinBet(Number.isNaN(v) ? 0 : v)
                          }}
                          style={{...STYLES.input, width: '100%'}}
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Max"
                          value={maxMinBet}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            setMaxMinBet(Number.isNaN(v) ? 0 : v)
                          }}
                          style={{...STYLES.input, width: '100%'}}
                        />
                      </div>
                    </div>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Min Prize ($)</label>
                      <input
                        type="number"
                        step="1"
                        value={minPrizeUsd}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          setMinPrizeUsd(Number.isNaN(v) ? 0 : v)
                        }}
                        style={STYLES.input}
                      />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="hunter-ops-section">
                <button
                  type="button"
                  className="hunter-ops-section-head"
                  onClick={() => setOpsSectionsOpen((prev) => ({ ...prev, local: !prev.local }))}
                >
                  <span>Local Challenge</span>
                  <span>{opsSectionsOpen.local ? '−' : '+'}</span>
                </button>
                {opsSectionsOpen.local ? (
                  <div className="hunter-ops-section-body">
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <label style={STYLES.label}>Create Local Challenge</label>
                        <button
                          type="button"
                          onClick={() => setLocalChallengeExpanded((prev) => !prev)}
                          className="hunter-ops-mini-btn"
                        >
                          {localChallengeExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                      {localChallengeExpanded ? (
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                          <input
                            type="text"
                            value={localChallengeSlotSearch}
                            onChange={(e) => setLocalChallengeSlotSearch(e.target.value)}
                            placeholder="Search slot (name/slug)"
                            style={{ ...STYLES.input, width: '100%' }}
                          />
                          <select
                            value={localChallengeSlotSlug}
                            onChange={(e) => setLocalChallengeSlotSlug(e.target.value)}
                            style={{ ...STYLES.input, width: '100%' }}
                          >
                            <option value="">— Select slot —</option>
                            {localChallengeSlotOptions.map((s) => (
                              <option key={s.slug} value={s.slug}>
                                {s.name || s.slug}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                            <div>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Target Multiplier (x)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="1.1"
                                value={localChallengeTargetMulti}
                                onChange={(e) => setLocalChallengeTargetMulti(e.target.value)}
                                style={{ ...STYLES.input, width: '100%' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Min Bet ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={localChallengeMinBetUsd}
                                onChange={(e) => setLocalChallengeMinBetUsd(e.target.value)}
                                style={{ ...STYLES.input, width: '100%' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              Win amount is not required for local challenges.
                            </div>
                            <Button
                              size="small"
                              onClick={createLocalChallenge}
                              title="Create a local challenge card and add it directly to queue"
                            >
                              Create
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="hunter-ops-section">
                <button
                  type="button"
                  className="hunter-ops-section-head"
                  onClick={() => setOpsSectionsOpen((prev) => ({ ...prev, runtime: !prev.runtime }))}
                >
                  <span>Runtime & Limits</span>
                  <span>{opsSectionsOpen.runtime ? '−' : '+'}</span>
                </button>
                {opsSectionsOpen.runtime ? (
                  <div className="hunter-ops-section-body">
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Allowed Currencies</label>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                        <div>
                          <label style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>Source (Crypto)</label>
                          <select
                            value={sourceCurrency}
                            onChange={e => setSourceCurrency(e.target.value)}
                            style={STYLES.input}
                          >
                            {cryptoOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>Target (Fiat/Display)</label>
                          <select
                            value={targetCurrency}
                            onChange={e => setTargetCurrency(e.target.value)}
                            style={STYLES.input}
                          >
                            {fiatOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            <option disabled>--- Crypto ---</option>
                            {cryptoOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.4rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            marginTop: '0.25rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={autoOptimalTargetCurrency}
                            onChange={(e) => setAutoOptimalTargetCurrency(e.target.checked)}
                            style={{ marginTop: '0.1rem' }}
                          />
                          <span>Auto target currency</span>
                        </label>
                      </div>
                    </div>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Max Parallel Slots ({CHALLENGE_SLIDER_MAX} max)</label>
                      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <input
                          type="range"
                          min={1}
                          max={CHALLENGE_SLIDER_MAX}
                          step={1}
                          value={maxParallelClamped}
                          onChange={(e) =>
                            setMaxParallel(Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, parseInt(e.target.value, 10) || 1)))
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '0.8rem', minWidth: 28, textAlign: 'right' }}>
                          {maxParallelClamped}
                        </span>
                      </div>
                    </div>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Pages to Load ({CHALLENGE_SLIDER_MAX} max)</label>
                      <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                        <input
                          type="range"
                          min={1}
                          max={CHALLENGE_SLIDER_MAX}
                          step={1}
                          value={pagesToLoadClamped}
                          onChange={(e) =>
                            setPagesToLoad(Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, parseInt(e.target.value, 10) || 1)))
                          }
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '0.8rem', minWidth: 28, textAlign: 'right' }}>
                          {pagesToLoadClamped}
                        </span>
                      </div>
                    </div>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Stop Loss (USD)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0 = off"
                        value={stopLossStr}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (!isUsdLimitInputCharsOk(raw)) return
                          setStopLossStr(raw)
                          setStopLoss(parseUsdLimitInput(raw))
                        }}
                        onBlur={() => {
                          const v = parseUsdLimitInput(stopLossStr)
                          setStopLoss(v)
                          setStopLossStr(usdLimitToInputStr(v))
                        }}
                        style={STYLES.input}
                      />
                    </div>
                    <div className="hunter-ops-group" style={STYLES.inputGroup}>
                      <label style={STYLES.label}>Stop Profit (USD)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0 = off"
                        value={stopProfitStr}
                        onChange={(e) => {
                          const raw = e.target.value
                          if (!isUsdLimitInputCharsOk(raw)) return
                          setStopProfitStr(raw)
                          setStopProfit(parseUsdLimitInput(raw))
                        }}
                        onBlur={() => {
                          const v = parseUsdLimitInput(stopProfitStr)
                          setStopProfit(v)
                          setStopProfitStr(usdLimitToInputStr(v))
                        }}
                        style={STYLES.input}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
          <div className="hunter-card hunter-ops-queue" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 className="hunter-section-title" style={{ marginBottom: '0.5rem' }}>Queue ({queue.length})</h3>
            <div style={{overflowY: 'auto', flex: 1}}>
              {queue.map((item) => {
                const q = normalizeQueueItem(item)
                const c = challenges.find((ch) => ch.id === q.challengeId)
                return c ? renderChallengeCard(c, true, null, true, item) : null
              })}
              {queue.length === 0 && <div style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}>Empty</div>}
            </div>
          </div>
          </div>
        </div>

        <div className="hunter-main">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div className="hunter-help-bar">
              Refresh list · queue target runs · Start Next for one run · Auto Hunt for continuous queue processing.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="hunter-meta" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Parallel: {runningCount} / {maxParallelClamped}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  onClick={startNextQueuedManually}
                  variant="primary"
                  disabled={queue.length === 0 || runningCount >= maxParallelClamped}
                  title="Start exactly one queued run (without scan or auto mode)"
                >
                  Start Next
                </Button>
                <Button
                  onClick={startAllRunners}
                  variant="primary"
                  title="Enable scan + auto-start and reload challenges when needed"
                >
                  Auto Hunt
                </Button>
                <Button
                  onClick={stopAllRunners}
                  variant="danger"
                  disabled={!hasAnythingToStop}
                  title={
                    hasAnythingToStop
                      ? 'Stop active spins, disable scan/auto, and clear queue'
                      : 'Nothing is active'
                  }
                >
                  Stop All
                </Button>
              </div>
            </div>
          </div>
          <div className="hunter-kpi-segments">
            <div className="hunter-kpi-segment">
              <div className="hunter-kpi-label">Wagered (USD)</div>
              <div className="hunter-kpi-value">${totalSessionStats.wagered.toFixed(2)}</div>
            </div>
            <div className="hunter-kpi-segment">
              <div className="hunter-kpi-label">Payout (USD)</div>
              <div className="hunter-kpi-value">${totalSessionStats.payout.toFixed(2)}</div>
            </div>
            <div className="hunter-kpi-segment">
              <div className="hunter-kpi-label">Profit (USD)</div>
              <div className="hunter-kpi-value" style={{ color: totalSessionStats.profit >= 0 ? 'var(--success)' : 'var(--error)' }}>
                ${totalSessionStats.profit.toFixed(2)}
              </div>
            </div>
          </div>

          {ENABLE_SESSION_NET_CHART && (
            <div
              className="hunter-net-chart"
              style={{
                marginTop: '0.5rem',
                padding: '0.6rem 0.7rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Profit trend (session)</div>
                <div
                  style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}
                  title={
                    sessionNetSpinCount > PROFIT_CHART_CAPACITY
                      ? `Session: ${sessionNetSpinCount} spins · chart window: last ${PROFIT_CHART_CAPACITY}`
                      : 'Session spin count'
                  }
                >
                  {Math.max(0, sessionNetSpinCount)} Spins
                  {sessionNetSpinCount > PROFIT_CHART_CAPACITY ? (
                    <span style={{ opacity: 0.75 }}> · last {PROFIT_CHART_CAPACITY} in chart</span>
                  ) : null}
                </div>
              </div>
              <div style={{ width: '100%' }} title={`Current net: $${netUsd.toFixed(2)}`} data-series-version={sessionNetSeriesVersion}>
                <SvgCumulativeProfitLineChart
                  profits={sessionNetSeriesSnapshot}
                  height={188}
                  stroke={netUsd >= 0 ? 'var(--success)' : 'var(--error)'}
                  betIndexStart={sessionChartBetRange.start}
                  betIndexEnd={sessionChartBetRange.end}
                />
              </div>
            </div>
          )}

          <div className="hunter-status-bar">
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Running</span>
              <span className="hunter-meta">{runningCount} / {maxParallelClamped}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Queue</span>
              <span className="hunter-meta">{queue.length}</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.35rem'}}>
              {activeRunList.slice(0, 6).map((run) => (
                <span
                  key={run.id}
                  className="hunter-pill"
                  title={run.runCurrency ? `${run.slotName} · ${run.runCurrency}` : run.slotName}
                >
                  {run.runCurrency ? `${run.slotName} · ${String(run.runCurrency).toUpperCase()}` : run.slotName}
                </span>
              ))}
              {activeRunList.length > 6 && (
                <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>+{activeRunList.length - 6}</span>
              )}
            </div>
          </div>
          {activeRunList.length === 0 ? (
            <div className="hunter-empty">
              No active challenge. <br/>
              Add items to queue below, then press <strong>Start Next</strong> or run Auto Hunt.
            </div>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem'}}>
              {activeRunList.map((run) => {
                const ch = challenges.find((x) => x.id === run.challengeId)
                const prizeLine = ch ? formatChallengePrize(ch) : { main: run.prizeDisplay ?? '—', hint: run.prizeHint ?? null }
                const shareRawForRun = run.bestBetId || hubPickShareRawFromBetList(hubRecentBets, run.id)
                const copyBetIdRunFormatted = formatStakeShareBetId(shareRawForRun)
                const canCopyRunShare =
                  typeof copyBetIdRunFormatted === 'string' && String(copyBetIdRunFormatted).trim() !== ''
                const copyBetIdRecord = loadOverallBetIdForSlug(run.slotSlug)
                const copyBetId =
                  (canCopyRunShare ? copyBetIdRunFormatted : null) ||
                  (copyBetIdRecord ? formatStakeShareBetId(copyBetIdRecord) : null)
                const previewBetId = copyBetId ? stakeBetIdForPreviewApi(copyBetId) : null
                const stakeBetLink = copyBetId ? stakeBetModalShareUrl(copyBetId) : null
                const runListMax = hubRecentBets?.length ? hunterHubListMaxForRun(hubRecentBets, run.id).max : 0
                const displayRunMax = hubRecentBets?.length
                  ? Math.max(Number(run.bestMultiRun) || 0, runListMax)
                  : Number(run.bestMultiRun) || 0
                const storedSlotNum =
                  bestMultiBySlot[run.slotSlug] != null && Number.isFinite(Number(bestMultiBySlot[run.slotSlug]))
                    ? Number(bestMultiBySlot[run.slotSlug])
                    : null
                const slotListMax =
                  hubRecentBets?.length && run.slotSlug ? hunterHubListMaxForSlot(hubRecentBets, run.slotSlug).max : 0
                const mergedSlotRec = Math.max(storedSlotNum ?? 0, slotListMax)
                const displaySlotRec = hubRecentBets?.length
                  ? mergedSlotRec > 0 || storedSlotNum != null
                    ? mergedSlotRec
                    : null
                  : storedSlotNum
                return (
                <div key={run.id} className="hunter-run-card">
                  <div className="hunter-run-card-inner">
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                    {run.slotName}
                    {run.currencySlotIndex > 0 ? (
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {' '}
                        (Copy #{run.currencySlotIndex + 1}
                        {run.runCurrency ? ` · ${String(run.runCurrency).toUpperCase()}` : ''})
                      </span>
                    ) : run.runCurrency ? (
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {' '}
                        · {String(run.runCurrency).toUpperCase()}
                      </span>
                    ) : null}
                    {run.forcedTargetCurrency ? (
                      <span
                        style={{ fontWeight: 500, color: 'var(--accent)', fontSize: '0.68rem', marginLeft: '0.25rem' }}
                        title="Manual target currency selected for this run"
                      >
                        manual
                      </span>
                    ) : null}
                  </div>
                  <div style={STYLES.statRow}>
                    <span>Status</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      {run.status === 'running' ? (
                        <span
                          title="Running"
                          aria-label="Running"
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle at 35% 35%, #86efac, #16a34a)',
                            boxShadow: '0 0 6px 2px rgba(34, 197, 94, 0.9), 0 0 16px rgba(34, 197, 94, 0.5)',
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{run.status}</span>
                      )}
                    </span>
                  </div>
                  <div style={STYLES.statRow}><span>Spins</span><span>{run.spins}</span></div>
                  <div style={STYLES.statRow}>
                    <span>Wagered (USD)</span>
                    <span>
                      $
                      {(
                        run.wageredUsd != null
                          ? run.wageredUsd
                          : minorToUsd(run.wagered, run.runCurrency || targetCurrency, rates)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span title="Cumulative per-spin net in USD (win minus stake)">
                      Net (USD)
                    </span>
                    <span>
                      $
                      {(run.wonUsd != null
                        ? run.wonUsd
                        : minorToUsd(run.won ?? 0, run.runCurrency || targetCurrency, rates)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span>Bet (USD)</span>
                    <span>${minorToUsd(run.currentBet, run.runCurrency || targetCurrency, rates).toFixed(2)}</span>
                  </div>
                  {String(run.providerId || '').toLowerCase() === 'stakeengine' ? (
                    <div style={STYLES.statRow}>
                      <span style={{ color: 'var(--text-muted)' }}>Seed Reset</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>every</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={Number(run.stakeRgsSeedResetEvery) || 0}
                          onChange={(e) => {
                            const n = Math.max(0, Math.min(100000, parseInt(e.target.value || '0', 10) || 0))
                            setActiveRuns((prev) => {
                              const cur = prev[run.id]
                              if (!cur) return prev
                              return { ...prev, [run.id]: { ...cur, stakeRgsSeedResetEvery: n } }
                            })
                          }}
                          style={{
                            width: '3.6rem',
                            padding: '0.12rem 0.25rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-deep)',
                            color: 'var(--text)',
                            fontSize: '0.72rem',
                            textAlign: 'right',
                          }}
                          title="0 = off. Applied when queued run starts; adjustable while running (Stake RGS)."
                        />
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Spins</span>
                      </span>
                    </div>
                  ) : null}
                  <div style={STYLES.statRow}>
                    <span style={{ fontWeight: 600 }}>Target Multi</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {run.targetMultiplier != null && Number.isFinite(Number(run.targetMultiplier))
                        ? `${Number(run.targetMultiplier).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`
                        : '—'}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Potential Prize</span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prizeLine.main}</span>
                      {prizeLine.hint ? (
                        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                          {prizeLine.hint}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Max (this run)</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <span>{Number(displayRunMax).toFixed(2)}×</span>
                      <button
                        type="button"
                        disabled={!canCopyRunShare}
                        onClick={() => {
                          if (!canCopyRunShare) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(copyBetIdRunFormatted).catch(() => {})
                              log(`Run bet id copied — ${run.slotName}`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: canCopyRunShare ? 'pointer' : 'not-allowed',
                          opacity: canCopyRunShare ? 1 : 0.45,
                        }}
                        title={
                          canCopyRunShare
                            ? `Same format as BetList: ${copyBetIdRunFormatted}`
                            : 'No houseBets share id yet (run state and feed rows are empty).'
                        }
                      >
                        Copy Run
                      </button>
                      <button
                        type="button"
                        disabled={!stakeBetLink}
                        onClick={() => {
                          if (!stakeBetLink) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(stakeBetLink).catch(() => {})
                              log(`Stake bet link copied (${run.slotName})`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: stakeBetLink ? 'pointer' : 'not-allowed',
                          opacity: stakeBetLink ? 1 : 0.45,
                        }}
                        title={
                          stakeBetLink
                            ? 'Full Stake share link (?iid is exact houseBets.iid, URL encoded)'
                            : 'Copy a bet id first (Copy ID).'
                        }
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        disabled={!previewBetId}
                        onClick={() => {
                          if (!previewBetId) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(previewBetId).catch(() => {})
                              log(`Bet preview UUID copied (${run.slotName}) — for POST /bet/preview body betId`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: previewBetId ? 'pointer' : 'not-allowed',
                          opacity: previewBetId ? 1 : 0.45,
                        }}
                        title={
                          previewBetId
                            ? 'UUID only (no casino: prefix) for Stake REST bet preview: { "betId": "<uuid>" }'
                            : 'Copy bet ID first (Copy ID).'
                        }
                      >
                        Preview
                      </button>
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Record Multi</span>
                    <span>
                      {run.slotSlug && displaySlotRec != null && Number.isFinite(Number(displaySlotRec))
                        ? `${Number(displaySlotRec).toFixed(2)}×`
                        : '—'}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Bet ID record (slot)</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', wordBreak: 'break-all', textAlign: 'right' }}>
                        {copyBetIdRecord || '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!copyBetIdRecord}
                        onClick={() => {
                          if (!copyBetIdRecord) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(copyBetIdRecord).catch(() => {})
                              log(`Bet ID (lifetime slot record, houseBets) copied — ${run.slotName}`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: copyBetIdRecord ? 'pointer' : 'not-allowed',
                          opacity: copyBetIdRecord ? 1 : 0.45,
                        }}
                      >
                        Copy
                      </button>
                    </span>
                  </div>
                  <div style={{marginTop: '0.5rem'}}>
                    <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                      <Button
                        onClick={() => stopRunByRunId(run.id)}
                        variant="secondary"
                        disabled={run.status !== 'running'}
                        title={
                          run.status === 'running'
                            ? 'No further spin after the current one — this parallel run only'
                            : 'No active spin'
                        }
                      >
                        Stop after spin
                      </Button>
                      <Button
                        onClick={() => restartRunByRunId(run.id)}
                        variant="primary"
                        disabled={run.status === 'running' || run.status === 'completed'}
                        title={
                          run.status === 'running'
                            ? 'Only possible after stop'
                            : run.status === 'completed'
                              ? 'Stake challenge completed'
                              : 'Start this run again'
                        }
                      >
                        Restart
                      </Button>
                      <Button
                        onClick={() => removeRun(run.id)}
                        variant="outline"
                        title="Aus Liste und Queue entfernen"
                      >
                        Aus Liste
                      </Button>
                    </div>
                  </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
          
          <div className="hunter-log">
            {logs.map((l, i) => (
              <div key={i} className="hunter-log-line">{l}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="hunter-found-panel">
        <div className="hunter-found-head">
          Found Challenges
          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            List layout: Slot, Target, Min Bet, Prize, Status. Click row to queue.
          </span>
          <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={challengeSearch}
              onChange={(e) => setChallengeSearch(e.target.value)}
              placeholder="Search slot by name or slug"
              style={{ ...STYLES.input, minWidth: 220, flex: '1 1 280px' }}
              aria-label="Search challenge slot"
            />
            <select
              value={challengeSort}
              onChange={(e) => setChallengeSort(e.target.value)}
              style={{ ...STYLES.input, minWidth: 200, flex: '0 0 auto' }}
              aria-label="Sort found challenges"
            >
              <option value="prize-desc">Prize: high to low</option>
              <option value="prize-asc">Prize: low to high</option>
              <option value="stake-desc">Stake: high to low</option>
              <option value="stake-asc">Stake: low to high</option>
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {visibleChallenges.length} / {challenges.length}
            </span>
          </div>
        </div>
        <div className="hunter-found-body" ref={foundScrollRef}>
          {sortedFoundChallenges.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No challenges match "{challengeSearch}".
            </div>
          ) : (
            <div
              className="hunter-found-grid"
              style={{
                height: `${foundRowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {foundRowVirtualizer.getVirtualItems().map((virtualRow) => {
                const c = sortedFoundChallenges[virtualRow.index]
                if (!c) return null
                const meta = getChallengeMeta(c)
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {renderFoundChallengeRow(c, meta)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
