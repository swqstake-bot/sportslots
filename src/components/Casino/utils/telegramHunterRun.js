/**
 * Gleiche Session-/Spin-Logik wie AutoChallengeHunter.startChallengeRun, für Telegram-Synthetic-Challenges.
 * Dependency Injection statt React-Closures.
 */
import { getProvider } from '../api/providers'
import { fetchCurrencyRates } from '../api/stakeChallenges'
import {
  placeDiceBet,
  placeKenoBet,
  placeLimboBet,
  placeMinesBet,
  placePacksBet,
  placePlinkoBet,
} from '../api/stakeOriginalsBets'
import { isFiat, isStable, formatAmount, toUnits, toMinor, ZERO_DECIMAL_CURRENCIES } from '../utils/formatAmount'
import { parseBetResponse } from '../utils/parseBetResponse'
import { CURRENCY_GROUPS, PROVIDER_CURRENCIES } from '../constants/currencies'
import { notifyChallengeStart } from '../utils/notifications'
import { effectiveSpinMultiplierFromParsed } from '../api/providers/stakeEngine'
import { appendBet } from '../utils/betHistoryDb'
import { formatStakeShareBetId } from '../utils/stakeBetShareId'
import {
  extractPacksBetFromStakeData,
  packsChallengeConditionMet,
  packsHintsHaveConstraint,
  resolveTelegramBetRoundId,
  getBetIdForParityCheck,
} from '../utils/packsOriginalsChallenge'

const HUNTER_TARGET_CANDIDATES = [
  ...CURRENCY_GROUPS.fiat.map((c) => c.value),
  ...CURRENCY_GROUPS.crypto.map((c) => c.value),
]

function getRateForCurrency(rates, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (c === 'usd') return 1
  return rates[c] || 0
}

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

function sortTargetCandidatesForProbe(allowedList, rates, minBetUsd, preferred) {
  const pref = (preferred || 'usd').toLowerCase()
  const candidates = []
  for (const tCurr of allowedList) {
    const rate = getRateForCurrency(rates, tCurr)
    if (!rate || rate <= 0) continue
    const usdEff = effectiveUsdAfterRounding(minBetUsd, rate, tCurr)
    if (usdEff == null || !Number.isFinite(usdEff)) continue
    const excess = usdEff - minBetUsd
    candidates.push({ tCurr, excess, fiat: isFiat(tCurr) })
  }
  if (candidates.length === 0) return []
  candidates.sort((a, b) => {
    if (a.fiat !== b.fiat) return a.fiat ? -1 : 1
    if (a.excess !== b.excess) return a.excess - b.excess
    if (a.tCurr === pref) return -1
    if (b.tCurr === pref) return 1
    return a.tCurr.localeCompare(b.tCurr)
  })
  return candidates.map((c) => c.tCurr)
}

/** Telegram-Hunter: alle klassischen Fiat-Proben wie AutoChallengeHunter (kein künstliches Limit). */
const SESSION_PROBE_DELAY_MS = 400
export const HUNTER_SPIN_DELAY_MS = 150
export const HUNTER_SPIN_ERROR_RETRY_MS = 2000
const AUTO_PROBE_EXCLUDED_CURRENCIES = new Set(['usdc', 'usdt'])
const DIRECT_ORIGINALS_SLUGS = new Set(['packs', 'dice', 'limbo', 'mines', 'plinko', 'keno'])

function getPlinkoRiskForChallenge(challenge) {
  const hint = String(challenge?.originalsObjective || '').toLowerCase()
  if (/\bhigh\b/.test(hint)) return 'high'
  if (/\bmedium\b/.test(hint)) return 'medium'
  if (/\blow\b/.test(hint)) return 'low'
  const target = Number(challenge?.targetMultiplier)
  if (Number.isFinite(target) && target >= 1000) return 'high'
  if (Number.isFinite(target) && target >= 100) return 'medium'
  return 'low'
}

async function placeDirectOriginalsBet(gSlug, amountFloat, currency, challenge) {
  const slug = String(gSlug || '').toLowerCase()
  if (slug === 'packs') {
    const identifier = String(challenge?.casesBetIdentifier || '').trim()
    if (!identifier) throw new Error('casesBet: identifier fehlt')
    return placePacksBet({
      amount: amountFloat,
      currency,
      identifier,
      difficulty: challenge?.casesBetDifficulty || 'medium',
    })
  }
  if (slug === 'limbo') {
    const target = Number(challenge?.targetMultiplier)
    return placeLimboBet({
      amount: amountFloat,
      currency,
      targetMultiplier: Number.isFinite(target) && target > 1 ? target : 2,
    })
  }
  if (slug === 'dice') {
    return placeDiceBet({
      amount: amountFloat,
      currency,
      rollUnder: 49.5,
      rollOver: false,
    })
  }
  if (slug === 'plinko') {
    const risk = getPlinkoRiskForChallenge(challenge)
    return placePlinkoBet({
      amount: amountFloat,
      currency,
      rows: 16,
      risk,
    })
  }
  if (slug === 'keno') {
    return placeKenoBet({
      amount: amountFloat,
      currency,
      picks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      risk: 'low',
    })
  }
  if (slug === 'mines') {
    return placeMinesBet({
      amount: amountFloat,
      currency,
      mineCount: 3,
    })
  }
  throw new Error(`Originals direct not supported: ${slug}`)
}

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

function formatPrizeParts(challenge) {
  if (challenge.award == null || !(Number(challenge.award) > 0)) return { main: '—', hint: null }
  return { main: `~$${Number(challenge.award).toFixed(2)}`, hint: null }
}

function finalizeTelegramTargetHit({
  challengeId,
  challenge,
  parsed,
  betAmount,
  win,
  gSlug,
  gName,
  tCurr,
  multi,
  roundId,
  log,
  logLine,
  appendBet,
  persistChallengeHitRecord,
}) {
  log(logLine)
  const shareId = formatStakeShareBetId(roundId)
  if (shareId) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareId).catch(() => {})
    }
    log(`Bet-ID in Zwischenablage: ${shareId}`)
  }
  const cc = (parsed.currencyCode || tCurr || 'usd').toUpperCase()
  appendBet(
    gSlug,
    {
      betAmount,
      winAmount: win,
      isBonus: false,
      balance: parsed.balance,
      currencyCode: cc,
      roundId: roundId ?? undefined,
    },
    gName
  ).catch(() => {})
  persistChallengeHitRecord({
    challengeId,
    roundId,
    slotSlug: gSlug,
    slotName: gName,
    targetMultiplier: challenge.targetMultiplier,
    hitMulti: multi,
    currency: tCurr,
  })
}

/**
 * @param {object} ctx
 */
export async function runTelegramChallengeSession(ctx) {
  const {
    challenge,
    challengeId,
    accessToken,
    slot,
    rates,
    sourceCurrency,
    targetCurrency,
    autoOptimalTargetCurrency,
    stopLoss,
    stopProfit,
    runnersRef,
    setActiveRuns,
    setTotalSessionStats,
    totalStatsRef,
    log,
    setBestMultiBySlot,
    persistBestMultiMap,
    persistChallengeHitRecord,
    onInsufficientBalance,
    /** Stop Loss / Stop Profit: Queue leeren, Auto-Start aus (wie bei zu wenig Guthaben). */
    onSessionStopLimit,
    /** Packs (casesBet): `identifier` aus Network-Variables; optional Kette über Bet-`id`. */
    casesBetIdentifier = '',
    chainCasesBetIdentifier = false,
    /** CasesDifficultyEnum */
    casesBetDifficulty = 'medium',
  } = ctx

  const gSlug = challenge.gameSlug || challenge.game?.slug
  const gName = challenge.gameName || challenge.game?.name || gSlug
  const prizeParts = formatPrizeParts(challenge)

  runnersRef.current[challengeId] = { stop: false }
  setActiveRuns((prev) => ({
    ...prev,
    [challengeId]: {
      status: 'running',
      spins: 0,
      wagered: 0,
      won: 0,
      balance: 0,
      currentBet: 0,
      slotName: slot.name,
      slotSlug: gSlug,
      bestMultiRun: 0,
      targetMultiplier: challenge.targetMultiplier,
      originalsOpenEnded: !!challenge.originalsOpenEnded,
      originalsObjective: challenge.originalsObjective || null,
      prizeDisplay: prizeParts.main,
      prizeHint: prizeParts.hint,
      startTime: Date.now(),
    },
  }))

  if (challenge.originalsOpenEnded) {
    const hint = challenge.originalsObjective ? ` — ${challenge.originalsObjective}` : ''
    log(`Telegram-Hunter: ${gName} (Originals Challenge – kein festes Multi-Ziel; Stop: Limit / manuell)${hint}`)
    notifyChallengeStart(gName || gSlug, null)
  } else {
    log(`Telegram-Hunter: ${gName} (Ziel: ${challenge.targetMultiplier}×)`)
    notifyChallengeStart(gName || gSlug, challenge.targetMultiplier)
  }

  try {
    const isDirectOriginals = DIRECT_ORIGINALS_SLUGS.has(String(gSlug || '').toLowerCase())
    const isPacksOriginal = String(gSlug || '').toLowerCase() === 'packs'
    const provider = isDirectOriginals ? null : await getProvider(slot.providerId)
    if (!provider && !isDirectOriginals) throw new Error(`Kein Provider für ${slot.providerId}`)

    const sCurr = sourceCurrency.toLowerCase()
    const providerId = isPacksOriginal ? 'stakeEngine' : slot.providerId || 'stakeEngine'
    const preferredTarget = (targetCurrency || 'usd').toLowerCase()
    const minBetUsd = challenge.minBetUsd

    let session = null
    let tCurr = preferredTarget
    let rate
    let betAmount

    // Originals direkt per Stake GraphQL: immer in Source-Währung setzen (echte Wallet-Balance),
    // sonst kann ein "insufficientBalance" auftreten, wenn z.B. USD gewählt ist,
    // aber das Guthaben in USDT/XRP liegt.
    if (isDirectOriginals) {
      tCurr = sCurr
      session = { betLevels: [] }
      rate = getRateForCurrency(rates, tCurr)
      if (!rate) throw new Error(`Kein Kurs für ${tCurr.toUpperCase()}`)
      const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
      betAmount = computed.betAmount
      log(
        `Originals direct currency: ${sCurr.toUpperCase()} -> ${tCurr.toUpperCase()} (immer Source); effektiv ~$${computed.usdAt.toFixed(2)} (Min $${minBetUsd})`
      )
    }

    if (autoOptimalTargetCurrency && !isDirectOriginals) {
      const allowed = getAllowedTargetCurrenciesForSlot(providerId)
      const probeAllowed = allowed.filter((c) => !AUTO_PROBE_EXCLUDED_CURRENCIES.has(String(c).toLowerCase()))
      const allowedFiat = probeAllowed.filter((c) => isFiat(c) && !isStable(c))
      const probePool = allowedFiat.length > 0 ? allowedFiat : probeAllowed
      let ordered =
        probePool.length && minBetUsd != null
          ? sortTargetCandidatesForProbe(probePool, rates, minBetUsd, preferredTarget)
          : []
      let probeRates = rates
      if (ordered.length < probePool.length && probePool.length > 1) {
        try {
          const freshRates = await fetchCurrencyRates(accessToken, { force: true })
          if (freshRates && typeof freshRates === 'object') {
            probeRates = { ...(probeRates || {}), ...freshRates }
            ordered =
              probePool.length && minBetUsd != null
                ? sortTargetCandidatesForProbe(probePool, probeRates, minBetUsd, preferredTarget)
                : ordered
          }
        } catch (_) {
          /* Probe mit vorhandenen Kursen fortsetzen */
        }
      }
      const probeLimit = ordered.length
      let bestProbe = null

      for (let i = 0; i < probeLimit; i++) {
        if (i > 0) await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
        const cand = ordered[i]
        const r = getRateForCurrency(probeRates, cand)
        if (!r) continue
        try {
          log(`Session-Probe: ${sCurr.toUpperCase()} -> ${cand.toUpperCase()}…`)
          const sess = await provider.startSession(accessToken, slot.slug, sCurr, cand)
          const { betAmount: ba, usdAt } = computeBetFromMinBetAndSession(sess, cand, r, minBetUsd)
          if (!bestProbe || usdAt < bestProbe.usdAt - 1e-9) {
            bestProbe = { session: sess, tCurr: cand, rate: r, betAmount: ba, usdAt }
          }
        } catch (e) {
          log(`Probe ${cand.toUpperCase()}: ${e?.message || e}`)
        }
      }

      if (bestProbe) {
        tCurr = bestProbe.tCurr
        rate = bestProbe.rate
        log(
          `Zielwährung auto: ${tCurr.toUpperCase()} — effektiv ~$${bestProbe.usdAt.toFixed(2)} (Min $${minBetUsd})`
        )
        if (probeLimit > 1) {
          await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
          log(`Session für ${tCurr.toUpperCase()} nach Proben neu starten (gültig für Spins)…`)
          session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
          const recomputed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
          betAmount = recomputed.betAmount
          log(`Einsatz nach frischer Session: ~$${recomputed.usdAt.toFixed(2)} USD`)
        } else {
          session = bestProbe.session
          betAmount = bestProbe.betAmount
        }
      }
    }

    if (!session) {
      tCurr = preferredTarget
      log(`Starte Session: ${sCurr.toUpperCase()} -> ${tCurr.toUpperCase()}…`)
      session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
      rate = getRateForCurrency(rates, tCurr)
      if (!rate) throw new Error(`Kein Kurs für ${tCurr.toUpperCase()}`)
      const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
      betAmount = computed.betAmount
      log(`Effektiver MinBet in USD: ~$${computed.usdAt.toFixed(2)} (Ziel: $${minBetUsd})`)
    }

    log(`Einsatz: ${formatAmount(betAmount, tCurr)} ${tCurr.toUpperCase()} (Min: $${minBetUsd})`)
    setActiveRuns((prev) => ({
      ...prev,
      [challengeId]: {
        ...prev[challengeId],
        currentBet: betAmount,
        runCurrency: tCurr,
      },
    }))

    let casesBetIdentity = String(casesBetIdentifier || '').trim()
    if (gSlug === 'packs' && !casesBetIdentity) {
      log('Packs/Cases: „Identifier“ fehlt — in Stake DevTools → Network → casesBet → variables kopieren (identifier).')
      throw new Error('casesBet: identifier fehlt')
    }

    let stopReason = null
    let targetHit = false
    while (!runnersRef.current[challengeId]?.stop) {
      const total = totalStatsRef.current
      const net = total.won - total.lost
      if (stopLoss > 0 && total.lost >= stopLoss) {
        log(`Stop Loss: $${total.lost.toFixed(2)} – alle Läufe stoppen, Auto-Start aus, Warteschlange leer.`)
        Object.keys(runnersRef.current).forEach((id) => {
          if (runnersRef.current[id]) runnersRef.current[id].stop = true
        })
        onSessionStopLimit?.()
        stopReason = 'stop_loss'
        break
      }
      if (stopProfit > 0 && net >= stopProfit) {
        log(`Stop Profit: $${net.toFixed(2)} – alle Läufe stoppen, Auto-Start aus, Warteschlange leer.`)
        Object.keys(runnersRef.current).forEach((id) => {
          if (runnersRef.current[id]) runnersRef.current[id].stop = true
        })
        onSessionStopLimit?.()
        stopReason = 'stop_profit'
        break
      }

      try {
        let data
        let parsed
        let win
        let safeMulti

        if (isDirectOriginals) {
          const amountFloat = toUnits(betAmount, tCurr)
          const directBet = await placeDirectOriginalsBet(
            gSlug,
            amountFloat,
            tCurr,
            {
              targetMultiplier: challenge?.targetMultiplier,
              casesBetIdentifier: casesBetIdentity,
              casesBetDifficulty,
            }
          )
          if (!directBet) throw new Error('Originals: keine gültige Bet-Antwort')
          const stakeRet = Number(directBet.amount)
          const payoutRet = Number(directBet.payout)
          if (!Number.isFinite(stakeRet) || !Number.isFinite(payoutRet)) {
            throw new Error('Originals: ungültige Bet-Antwort')
          }
          data = {
            statusCode: 0,
            accountBalance: { balance: null, currencyCode: tCurr },
            round: {
              roundId: directBet.id,
              winAmountDisplay: toMinor(payoutRet, tCurr),
            },
            _stakeEngine: { raw: { originalBet: directBet, casesBet: isPacksOriginal ? directBet : null, packsBet: isPacksOriginal ? directBet : null } },
          }
          parsed = parseBetResponse(data, betAmount)
          win = parsed.winAmount || 0
          const wageredUsd = toUnits(betAmount, tCurr) * rate
          const payoutUsd = payoutRet * rate
          const netSpinUsd = payoutUsd - wageredUsd
          setTotalSessionStats((t) => ({
            wagered: t.wagered + wageredUsd,
            won: t.won + Math.max(0, netSpinUsd),
            lost: t.lost + Math.max(0, -netSpinUsd),
          }))
          const payoutMultRaw = Number(directBet.payoutMultiplier ?? 0)
          safeMulti = effectiveSpinMultiplierFromParsed(payoutMultRaw, parsed)
          if (!Number.isFinite(safeMulti) || safeMulti <= 0) {
            safeMulti = stakeRet > 0 ? payoutRet / stakeRet : 0
          }
          if (isPacksOriginal && chainCasesBetIdentifier !== false && directBet?.id) {
            casesBetIdentity = String(directBet.id)
          }
        } else {
          const result = await provider.placeBet(session, betAmount, false, false)
          const { data: d, nextSeq, session: updatedSession } = result || {}
          data = d
          session = updatedSession ? updatedSession : session ? { ...session, seq: nextSeq } : session

          parsed = data ? parseBetResponse(data, betAmount) : { winAmount: 0, balance: null }
          win = parsed.winAmount || 0
          const wageredUsd = toUnits(betAmount, tCurr) * rate
          const payoutUsd = toUnits(win, tCurr) * rate
          const netSpinUsd = payoutUsd - wageredUsd
          setTotalSessionStats((t) => ({
            wagered: t.wagered + wageredUsd,
            won: t.won + Math.max(0, netSpinUsd),
            lost: t.lost + Math.max(0, -netSpinUsd),
          }))
          const rawRound = data?._stakeEngine?.raw?.round
          const payoutMultRaw = Number(rawRound?.payoutMultiplier ?? rawRound?.payout_multiplier ?? 0)
          safeMulti = effectiveSpinMultiplierFromParsed(payoutMultRaw, parsed)
        }

        if (safeMulti > 0 && gSlug) {
          setBestMultiBySlot((prev) => {
            const cur = prev[gSlug] ?? 0
            if (safeMulti <= cur) return prev
            const next = { ...prev, [gSlug]: safeMulti }
            persistBestMultiMap(next)
            return next
          })
        }

        setActiveRuns((prev) => ({
          ...prev,
          [challengeId]: {
            ...prev[challengeId],
            spins: prev[challengeId].spins + 1,
            wagered: prev[challengeId].wagered + betAmount,
            won: prev[challengeId].won + win,
            balance: parsed.balance,
            bestMultiRun: Math.max(prev[challengeId].bestMultiRun ?? 0, safeMulti),
          },
        }))

        const multi = safeMulti
        const resolvedRoundId = resolveTelegramBetRoundId(data, parsed.roundId)
        const parityBetId = getBetIdForParityCheck(data, parsed.roundId)
        const packsBet = extractPacksBetFromStakeData(data)
        const packsMet =
          gSlug === 'packs' &&
          challenge.packsHints &&
          packsHintsHaveConstraint(challenge.packsHints) &&
          packsChallengeConditionMet(packsBet, challenge.packsHints, parityBetId)

        if (packsMet) {
          targetHit = true
          finalizeTelegramTargetHit({
            challengeId,
            challenge,
            parsed,
            betAmount,
            win,
            gSlug,
            gName,
            tCurr,
            multi,
            roundId: resolvedRoundId,
            log,
            logLine: `ORIGINALS PACKS: Aufgabe erfüllt (state.cards / Bet-ID). Multi ${multi.toFixed(2)}×`,
            appendBet,
            persistChallengeHitRecord,
          })
          break
        }

        const multiTargetActive =
          !challenge.originalsOpenEnded &&
          challenge.targetMultiplier != null &&
          Number.isFinite(Number(challenge.targetMultiplier)) &&
          Number(challenge.targetMultiplier) > 0
        if (multiTargetActive && multi >= challenge.targetMultiplier) {
          targetHit = true
          finalizeTelegramTargetHit({
            challengeId,
            challenge,
            parsed,
            betAmount,
            win,
            gSlug,
            gName,
            tCurr,
            multi,
            roundId: resolvedRoundId,
            log,
            logLine: `ZIEL ERREICHT! ${multi.toFixed(2)}× (Ziel: ${challenge.targetMultiplier}×)`,
            appendBet,
            persistChallengeHitRecord,
          })
          break
        }

        await new Promise((r) => setTimeout(r, HUNTER_SPIN_DELAY_MS))
      } catch (e) {
        const msg = String(e?.message || '')
        log(`Spin-Fehler: ${msg}`)
        if (e?.insufficientBalance || msg.includes('ERR_IPB')) {
          log('Guthaben reicht nicht – Telegram-Hunter stoppt alle Läufe.')
          Object.keys(runnersRef.current).forEach((id) => {
            if (runnersRef.current[id]) runnersRef.current[id].stop = true
          })
          onInsufficientBalance?.()
          stopReason = 'insufficient_balance'
          break
        }
        await new Promise((r) => setTimeout(r, HUNTER_SPIN_ERROR_RETRY_MS))
      }
    }

    log('Run beendet.')
    const status = challenge.completedAt ? 'completed' : targetHit ? 'target_hit' : stopReason || 'stopped'
    setActiveRuns((prev) => ({
      ...prev,
      [challengeId]: { ...prev[challengeId], status },
    }))
  } catch (e) {
    log(`Start-Fehler: ${e.message}`)
    setActiveRuns((prev) => ({
      ...prev,
      [challengeId]: { ...prev[challengeId], status: 'failed' },
    }))
  } finally {
    delete runnersRef.current[challengeId]
  }
}
