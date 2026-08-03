/**
 * Turbo mode: fire bets in parallel without waiting for each API response.
 * Best for flat-bet wagering on single-shot originals (dice, limbo, plinko, …).
 */
import { placeOriginalsBet } from '../engine/placeOriginalsBet'
import { resolveOriginalsRoundUsd, buildPlacementContext } from '../engine/originalsRoundResult'
import { checkWorkbenchStops } from '../engine/workbenchStops'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { createScriptHouseBetIdBridge } from '../scriptEngine/scriptHouseBetIdBridge'
import type { ProfileRunnerCallbacks } from './runProfile'
import { isTurboCompatibleGame, isRateLimitError, TURBO_RATE_LIMIT_COOLDOWN_MS, TURBO_RATE_LIMIT_INTERVAL_BUMP_MS, turboSpawnRatePerSec } from '../engine/turboConfig'
import { waitWhilePaused, type SessionSignal } from '../engine/sessionSignal'
import { fetchPacksProgress } from '../../../api/stakeOriginalsBets'
import {
  PACKS_TOTAL_CARDS,
  PACKS_PROGRESS_LOG_INTERVAL_MS,
  formatPacksProgressLog,
  isPacksCollectionComplete,
  packsCollectedFromBetApi,
  packsHuntAmountForCurrency,
  packsNewCardIdsFromBetApi,
  packsRemaining,
  publishPacksProgress,
} from '../../../utils/packsProgress'
import { isGoldCoinCurrency } from '../../../utils/currencyMeta'

function optFrom(opts: Record<string, unknown>, key: string, fallback: number): number {
  const v = opts[key]
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function usdToCurrencyAmount(usd: number, currency: string, usdRates?: Record<string, number>): number {
  if (!(usd > 0)) return usd
  // GC/SC: native major (HAR packs bet amount 1000 gold / 0.1 sweeps) — ignore Stake FX baseRate.
  if (isGoldCoinCurrency(currency)) return Math.round(usd * 100) / 100
  const rate = usdRates?.[currency.toLowerCase()]
  if (rate && rate > 0) return usd / rate
  return usd
}

export type TurboSettings = {
  fireIntervalMs: number
  maxInFlight: number
}

export async function runTurboProfile(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ProfileRunnerCallbacks,
  signal: SessionSignal,
  turbo: TurboSettings,
  usdRates?: Record<string, number>,
  accessToken?: string
): Promise<void> {
  const game = String(options.game || 'dice').toLowerCase()
  if (!isTurboCompatibleGame(game)) {
    callbacks.onLog?.(`Turbo not supported for ${game} — use normal mode.`)
    return
  }

  const houseBetBridge = createScriptHouseBetIdBridge(accessToken, callbacks.onBetShareId)
  const cur = (currency || 'usdc').toLowerCase()
  const workbenchOptions: OriginalsWorkbenchOptions = {
    ...((options._workbenchOptions ?? {}) as OriginalsWorkbenchOptions),
    game,
  }
  const wbSettings = (options._workbenchSettings ?? {}) as { maxFiatBetSize?: number }
  const capBetUsd = (usd: number): number => {
    const max = wbSettings.maxFiatBetSize ?? 0
    return max > 0 && usd > max ? max : usd
  }

  const initialBetUsd = (() => {
    for (const v of [options.initialBetSize, options.betSize]) {
      if (v === undefined || v === null || v === '') continue
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) return n
    }
    return 0.01
  })()
  const huntPacksCards = !!workbenchOptions.huntPacksCards && game === 'packs'
  const huntPacksStake = huntPacksCards ? packsHuntAmountForCurrency(cur) : 0
  const effectiveInitialBetUsd = huntPacksCards ? huntPacksStake : initialBetUsd
  let numberOfBets = Math.max(0, optFrom(options, 'numberOfBets', 0))
  if (huntPacksCards) numberOfBets = 0
  const stopOnProfit = optFrom(options, 'stopOnProfit', 0)
  const stopOnLoss = optFrom(options, 'stopOnLoss', 0)
  const stopOnTotalWagered = optFrom(options, 'stopOnTotalWagered', 0)
  let lastPacksCollected: number | null = null
  let lastPacksProgressLogAt = 0
  let packsNewSinceLog: number[] = []

  if (huntPacksCards) {
    callbacks.onLog?.(
      `Hunt packs cards (turbo) — stake ${huntPacksStake} ${cur.toUpperCase()} until ${PACKS_TOTAL_CARDS} cards (or Stop)`
    )
    try {
      const prog = await fetchPacksProgress()
      lastPacksCollected = prog.collected
      lastPacksProgressLogAt = Date.now()
      publishPacksProgress(prog.collected)
      const rem = packsRemaining(prog.collected)
      callbacks.onLog?.(
        rem > 0
          ? `Packs: ${prog.collected}/${PACKS_TOTAL_CARDS} — ${rem} remaining`
          : `Packs: collection already complete (${prog.collected}/${PACKS_TOTAL_CARDS})`
      )
      if (isPacksCollectionComplete(prog.collected)) {
        callbacks.onLog?.('Stop: packs collection complete')
        return
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(`Packs progress fetch failed: ${msg.slice(0, 120)}`)
    }
  }

  const sessionStartMs = Date.now()
  let rollNumber = 0
  const betIndexOffset = Math.max(0, optFrom(options, '_betIndexOffset', 0))
  const toBetListIndex = (localRoll: number) => localRoll + betIndexOffset
  let inFlight = 0
  let stopped = false
  let profitUsd = 0
  let totalWageredUsd = 0
  let wins = 0
  let losses = 0
  let maxMulti = 0
  let maxWinUsd = 0
  let maxRoundProfitUsd = 0
  let maxBetUsd = 0
  let longestWinStreak = 0
  let currentStreak = 0
  let lastWin = false
  let lastMultiForStop = 0
  let lastBetIdStr = ''
  let peakProfitUsd = 0

  let processChain: Promise<void> = Promise.resolve()

  const enqueueProcess = (fn: () => void | Promise<void>) => {
    processChain = processChain.then(fn).catch(() => {})
  }

  const emitStats = () => {
    const sessionElapsedMs = Date.now() - sessionStartMs
    const completed = wins + losses
    const betsPerSec = sessionElapsedMs >= 200 ? completed / (sessionElapsedMs / 1000) : 0
    callbacks.onStats?.({
      bets: completed,
      profit: profitUsd,
      wins,
      losses,
      totalWagered: totalWageredUsd,
      maxMulti,
      maxB2bMulti: 0,
      maxWinUsd,
      maxRoundProfitUsd,
      maxBetUsd,
      longestB2bStreak: 0,
      longestWinStreak,
      currentB2bStreak: 0,
      sessionElapsedMs,
      betsPerSec,
      b2bSecuredUsd: 0,
      rtp: totalWageredUsd > 0 ? (totalWageredUsd + profitUsd) / totalWageredUsd : 0,
    })
  }

  const checkStop = (): boolean => {
    if (stopOnProfit > 0 && profitUsd >= stopOnProfit) {
      callbacks.onLog?.(`Stop: profit $${profitUsd.toFixed(4)}`)
      return true
    }
    if (stopOnLoss > 0 && profitUsd <= -stopOnLoss) {
      callbacks.onLog?.(`Stop: loss $${Math.abs(profitUsd).toFixed(4)}`)
      return true
    }
    if (stopOnTotalWagered > 0 && totalWageredUsd >= stopOnTotalWagered) {
      callbacks.onLog?.(`Stop: wagered $${totalWageredUsd.toFixed(2)}`)
      return true
    }
    const stopReason = checkWorkbenchStops(workbenchOptions, {
      profitUsd,
      peakProfitUsd,
      totalWageredUsd,
      lastMulti: lastMultiForStop,
      lastBetId: lastBetIdStr,
      lastWin,
      rollNumber: wins + losses,
      b2bProduct: 0,
      b2bStreak: 0,
    })
    if (stopReason) {
      callbacks.onLog?.(`Stop: ${stopReason}`)
      return true
    }
    return false
  }

  let effectiveFireIntervalMs = turbo.fireIntervalMs
  let effectiveMaxInFlight = turbo.maxInFlight
  let rateLimitHits = 0

  callbacks.onLog?.(
    `Turbo ⚡ — max ${effectiveMaxInFlight} in flight, interval ${effectiveFireIntervalMs}ms (~${turboSpawnRatePerSec(effectiveFireIntervalMs).toFixed(1)}/s spawn, flat bet $${effectiveInitialBetUsd.toFixed(4)})`
  )

  const handleRateLimit = async (msg: string) => {
    rateLimitHits++
    effectiveFireIntervalMs = Math.min(500, effectiveFireIntervalMs + TURBO_RATE_LIMIT_INTERVAL_BUMP_MS)
    effectiveMaxInFlight = Math.max(1, effectiveMaxInFlight - 1)
    callbacks.onLog?.(
      `Rate limited — slowing turbo to ${effectiveFireIntervalMs}ms / ${effectiveMaxInFlight} in flight (${msg.slice(0, 80)})`
    )
    if (rateLimitHits >= 2) {
      callbacks.onLog?.(`Rate limit pause ${TURBO_RATE_LIMIT_COOLDOWN_MS / 1000}s`)
      await sleep(TURBO_RATE_LIMIT_COOLDOWN_MS)
      rateLimitHits = 0
    }
  }

  const fireBet = () => {
    if (signal.cancelled || stopped) return
    rollNumber++
    const betIndex = toBetListIndex(rollNumber)
    const betSizeUsd = huntPacksCards ? huntPacksStake : capBetUsd(effectiveInitialBetUsd)
    const amountMajor = usdToCurrencyAmount(betSizeUsd, cur, usdRates)
    inFlight++

    houseBetBridge.registerPending({ betIndex, at: Date.now(), game })

    const betOpts: OriginalsWorkbenchOptions = {
      ...workbenchOptions,
      game,
      initialBetSize: betSizeUsd,
      betSize: betSizeUsd,
      ...(huntPacksCards ? { numberOfBets: 0 } : {}),
    }

    void placeOriginalsBet(game, betOpts as Record<string, unknown>, amountMajor, cur, signal, callbacks.onLog)
      .then((placed) => {
        houseBetBridge.linkBetApiId(
          betIndex,
          placed.betApi?.id ?? placed.betApi?.betApiId ?? placed.betIid
        )
        enqueueProcess(() => {
          if (signal.cancelled) return
          const placementCtx = buildPlacementContext(game, betOpts as Record<string, unknown>)
          const round = resolveOriginalsRoundUsd(
            placed.betApi,
            placed.wageredMajor ?? amountMajor,
            placed.payout ?? 0,
            cur,
            usdRates,
            game,
            placementCtx
          )
          const wageredUsdThisRound = round.wageredUsd
          const payoutUsd = round.payoutUsd
          const multi = round.multi
          const win = round.win
          const roundProfitUsd = payoutUsd - wageredUsdThisRound

          totalWageredUsd += wageredUsdThisRound
          profitUsd += roundProfitUsd
          peakProfitUsd = Math.max(peakProfitUsd, profitUsd)
          if (win) {
            wins++
            currentStreak = lastWin ? currentStreak + 1 : 1
          } else {
            losses++
            currentStreak = lastWin ? -1 : currentStreak - 1
          }
          lastWin = win
          maxMulti = Math.max(maxMulti, multi)
          maxBetUsd = Math.max(maxBetUsd, wageredUsdThisRound)
          if (win) {
            maxWinUsd = Math.max(maxWinUsd, payoutUsd)
            if (roundProfitUsd > 0) maxRoundProfitUsd = Math.max(maxRoundProfitUsd, roundProfitUsd)
          }
          if (currentStreak > 0) longestWinStreak = Math.max(longestWinStreak, currentStreak)
          lastMultiForStop = multi
          const betShareId = houseBetBridge.getShareId(betIndex)
          lastBetIdStr = betShareId ?? placed.betIid ?? ''
          callbacks.onBetPlaced?.({
            iid: placed.betIid,
            betId: betShareId,
            payout: round.payout,
            amount: placed.wageredMajor,
            game,
            betIndex,
            betSizeUsd: wageredUsdThisRound,
            payoutUsd,
            roundProfitUsd,
            profitUsd,
            multi,
            b2bMulti: 0,
            win,
            kenoPicks: round.kenoPicks,
            kenoDrawn: round.kenoDrawn,
            kenoHits: round.kenoHits,
            diceTarget: round.diceTarget,
            diceResult: round.diceResult,
            limboTarget: round.limboTarget,
            limboResult: round.limboResult,
            minesCount: round.minesCount,
            diamondsCount: round.diamondsCount,
            minesSelected: round.minesSelected,
            minesLocations: round.minesLocations,
            hiloCards: round.hiloCards,
            hiloRank: round.hiloRank,
            hiloSuit: round.hiloSuit,
          })
          emitStats()
          if (huntPacksCards) {
            const collected = packsCollectedFromBetApi(placed.betApi)
            const newIds = packsNewCardIdsFromBetApi(placed.betApi)
            if (newIds.length) packsNewSinceLog.push(...newIds)
            if (collected != null) {
              const now = Date.now()
              const due =
                lastPacksProgressLogAt === 0 ||
                now - lastPacksProgressLogAt >= PACKS_PROGRESS_LOG_INTERVAL_MS ||
                isPacksCollectionComplete(collected)
              if (due) {
                publishPacksProgress(collected)
                callbacks.onLog?.(
                  formatPacksProgressLog(collected, {
                    newIds: packsNewSinceLog,
                    prevCollected: lastPacksCollected,
                  })
                )
                lastPacksCollected = collected
                packsNewSinceLog = []
                lastPacksProgressLogAt = now
              }
              if (isPacksCollectionComplete(collected)) {
                callbacks.onLog?.(
                  `Stop: packs collection complete (${collected}/${PACKS_TOTAL_CARDS})`
                )
                stopped = true
              }
            }
          }
          if (checkStop()) stopped = true
        })
      })
      .catch(async (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        if (isRateLimitError(e)) {
          await handleRateLimit(msg)
        } else {
          callbacks.onLog?.(`Turbo bet error: ${msg.slice(0, 120)}`)
        }
      })
      .finally(() => {
        inFlight--
      })
  }

  try {
    while (!signal.cancelled && !stopped) {
      const completed = wins + losses
      if (numberOfBets > 0 && completed >= numberOfBets && inFlight === 0) break
      if (numberOfBets > 0 && rollNumber >= numberOfBets && inFlight > 0) {
        await sleep(20)
        continue
      }

      if (signal.paused) {
        if (await waitWhilePaused(signal)) break
        continue
      }
      if (inFlight < effectiveMaxInFlight && (numberOfBets === 0 || rollNumber < numberOfBets)) {
        fireBet()
        await sleep(effectiveFireIntervalMs)
      } else {
        await sleep(15)
      }
    }

    while (inFlight > 0 && !signal.cancelled) {
      await sleep(30)
    }
    await processChain
  } finally {
    houseBetBridge.dispose()
    callbacks.onLog?.(`Turbo finished — ${wins + losses} bets resolved.`)
  }
}
