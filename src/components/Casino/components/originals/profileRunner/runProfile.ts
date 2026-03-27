/**
 * Profil-Runner: Antebot-kompatibles JSON-Profil parsen und Session gegen Stake-API ausführen.
 */

import {
  placeDiceBet,
  placeLimboBet,
  placeMinesBet,
  minesReveal,
  minesCashout,
  placePlinkoBet,
  placeKenoBet,
  rotateSeedPair,
} from '../../../api/stakeOriginalsBets'
import { playBlackjackScriptRound } from '../blackjack/blackjackScriptRound'

const GRID_SIZE = 25

export interface ProfileRunnerCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (result: { iid?: string; payout?: number; amount?: number; error?: string; game?: string; betSizeUsd?: number; payoutUsd?: number; profitUsd?: number; multi?: number; b2bMulti?: number }) => void
  onStats?: (stats: { bets: number; profit: number; wins: number; losses: number; totalWagered: number }) => void
  /** Aufgerufen bei jedem „Seed-Reset“-Block (z. B. alle 25 Bets); Einsatz wird dann um increaseBetAfterSeedReset erhöht. */
  onSeedReset?: (tierIndex: number, newBetSize: number) => void
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Rechnet Einsatz in USD in die Spielwährung um (1 Einheit Währung = usdRates[currency] USD).
 * Ohne usdRates wird der Wert 1:1 verwendet (Einsatz = Währungseinheiten).
 */
function usdToCurrencyAmount(usdAmount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || usdAmount <= 0) return usdAmount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return usdAmount
  const amount = usdAmount / rate
  // Crypto: max 8 Dezimalstellen; Fiat/Stable: 2
  const isStable = ['usd', 'usdc', 'usdt', 'eur'].includes(currency.toLowerCase())
  return isStable ? Math.round(amount * 100) / 100 : Math.round(amount * 1e8) / 1e8
}

/** Rechnet Einsatz in Spielwährung zurück nach USD (inverse von usdToCurrencyAmount). */
function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || amount <= 0) return amount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return amount
  const usd = amount * rate
  // USD intern: 8 Dezimalstellen reichen (Crypto) und sind stabil für Profile
  return Math.round(usd * 1e8) / 1e8
}

/** Liest Zahl aus options; für Recovery nutzen wir recoveryOptions. */
function optFrom(o: Record<string, unknown>, key: string, def: number): number {
  return (o[key] as number) ?? def
}
function optBoolFrom(o: Record<string, unknown>, key: string, def: boolean): boolean {
  return (o[key] as boolean) ?? def
}

/** Nimmt Antebot-style options (camelCase) und führt Session aus. Optional: recoveryGame + recoveryTrigger → bei Verlust/Streak Wechsel zu Recovery-Spiel, nach Erholung zurück. */
export async function runProfile(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ProfileRunnerCallbacks,
  signal: { cancelled: boolean },
  usdRates?: Record<string, number>
): Promise<void> {
  const cur = (currency || 'usdc').toLowerCase()
  const toAmount = (usd: number) => usdToCurrencyAmount(usd, cur, usdRates)

  // Recovery-Konfig (optional): Wechsel zu 2. Spiel bei Verlust, zurück wenn profit >= 0
  const recoveryOptions = options.recoveryOptions as Record<string, unknown> | undefined
  const recoveryGame = recoveryOptions ? ((recoveryOptions.game as string) || 'limbo') : ''
  const recoveryTrigger = (options.recoveryTrigger as string) || 'lossStreak' // 'lossStreak' | 'profitBelow'
  const recoveryTriggerValue = optFrom(options, 'recoveryTriggerValue', 4)
  const recoveryEndTrigger = (options.recoveryEndTrigger as string) || 'profitNonNegative' // 'profitNonNegative' | 'winStreak'
  const recoveryEndValue = optFrom(options, 'recoveryEndValue', 1)
  const hasRecovery = !!recoveryGame && !!recoveryOptions

  type Mode = 'wager' | 'recovery'
  let mode: Mode = 'wager'
  let currentOpts = options
  let currentGame = (currentOpts.game as string) || 'dice'

  const initialBetSizeWager = Math.max(0.00000001, Number(options.initialBetSize) || Number(options.betSize) || 0.01)
  const initialBetSizeRec = recoveryOptions ? Math.max(0.00000001, Number(recoveryOptions.initialBetSize) || Number(recoveryOptions.betSize) || 0.01) : 0.01

  let betSizeUsd = initialBetSizeWager
  let currentBlockBase = initialBetSizeWager
  let profitUsd = 0
  let wins = 0
  let losses = 0
  let totalWageredUsd = 0
  let rollNumber = 0
  let currentStreak = 0
  let lastWin = false
  let b2bCount = 0
  let b2bChainBaseUsd = 0
  let rollsInCurrentSeedBlock = 0
  let blockIndex = 0
  let lastRotatedOnLoss = false
  let seedResetLossAmountTriggered = false

  const stopOnProfit = optFrom(options, 'stopOnProfit', 0)
  const stopOnLoss = optFrom(options, 'stopOnLoss', 0)
  const stopOnWinStreak = optBoolFrom(options, 'isStopOnWinStreak', false) ? optFrom(options, 'stopOnWinStreak', 0) : 0
  const stopOnLossStreak = optBoolFrom(options, 'isStopOnLossStreak', false) ? optFrom(options, 'stopOnLossStreak', 0) : 0
  const stopOnB2bStreak = optBoolFrom(options, 'isStopOnB2bStreak', false) ? optFrom(options, 'stopOnB2bStreak', 0) : 0
  
  // Rotation (optional): ein Script nutzt 2–3 Spiele nacheinander, z. B. Dice→Limbo→Keno→repeat.
  type RotationStage = { game: string; bets: number; options?: Record<string, unknown> }
  const rotationStagesRaw = options.rotationStages as unknown
  const rotationStages: RotationStage[] = Array.isArray(rotationStagesRaw)
    ? (rotationStagesRaw as RotationStage[])
        .map((s) => ({
          game: String((s as any)?.game || '').toLowerCase(),
          bets: Math.max(0, Number((s as any)?.bets ?? 0) || 0),
          options: (s as any)?.options && typeof (s as any).options === 'object' ? ((s as any).options as Record<string, unknown>) : undefined,
        }))
        .filter((s) => !!s.game && s.bets > 0)
    : []
  let rotationIndex = 0
  let rotationBetsLeft = rotationStages[0]?.bets ?? 0
  const applyRotationStage = (idx: number) => {
    if (rotationStages.length === 0) return
    rotationIndex = (idx + rotationStages.length) % rotationStages.length
    rotationBetsLeft = rotationStages[rotationIndex]?.bets ?? 0
    const stage = rotationStages[rotationIndex]
    currentGame = stage.game
    currentOpts = { ...options, ...(stage.options ?? {}), game: stage.game }
    // Einsatz pro Stage resetten (damit jede Stage „sauber“ startet)
    const stageInitial = Math.max(0.00000001, Number(currentOpts.initialBetSize) || Number(currentOpts.betSize) || initialBetSizeWager)
    betSizeUsd = stageInitial
    currentBlockBase = stageInitial
    rollsInCurrentSeedBlock = 0
    lastRotatedOnLoss = false
    blockIndex = 0
    lastWin = false
    currentStreak = 0
    b2bChainBaseUsd = 0
    callbacks.onLog?.(`→ Rotation: ${stage.game.toUpperCase()} (${rotationBetsLeft} Bets)`)
  }
  if (rotationStages.length > 0) applyRotationStage(0)

  const applyWinFor = (opts: Record<string, unknown>, lastPayoutCurrency: number) => {
    const onWin = (opts.onWin as string) || 'reset'
    const initialForMode = opts === recoveryOptions ? initialBetSizeRec : initialBetSizeWager
    if (onWin === 'none') return
    if (onWin === 'reset' || onWin === 'martingale') betSizeUsd = initialForMode
    else if (onWin === 'increase') betSizeUsd = betSizeUsd * (1 + (optFrom(opts, 'increaseOnWin', 0) / 100))
    else if (onWin === 'b2b') {
      const nextUsd = currencyAmountToUsd(lastPayoutCurrency, cur, usdRates)
      if (Number.isFinite(nextUsd) && nextUsd > 0) betSizeUsd = Math.max(0.00000001, nextUsd)
    }
  }
  const applyLossFor = (opts: Record<string, unknown>) => {
    const onLoss = (opts.onLoss as string) || 'reset'
    const initialForMode = opts === recoveryOptions ? initialBetSizeRec : initialBetSizeWager
    const seedRolls = optFrom(opts, 'seedChangeAfterRolls', 0)
    const incAfter = optFrom(opts, 'increaseBetAfterSeedReset', 0)
    if (onLoss === 'none') return
    if (onLoss === 'reset') {
      betSizeUsd = (seedRolls > 0 && incAfter > 0) ? currentBlockBase : initialForMode
    } else if (onLoss === 'martingale') betSizeUsd = betSizeUsd * 2
    else if (onLoss === 'increase') betSizeUsd = betSizeUsd * (1 + (optFrom(opts, 'increaseOnLoss', 0) / 100))
  }

  while (!signal.cancelled) {
    rollNumber++
    let payout = 0

    // Rotation: nach X Bets zum nächsten Spiel
    if (mode === 'wager' && rotationStages.length > 0) {
      if (rotationBetsLeft <= 0) applyRotationStage(rotationIndex + 1)
      rotationBetsLeft--
    }

    // Seed-Block-Logik pro aktuellem Spiel (nur im wager-mode)
    const seedChangeAfterRolls = mode === 'wager' && optBoolFrom(currentOpts, 'isSeedChangeAfterRolls', false) ? optFrom(currentOpts, 'seedChangeAfterRolls', 0) : 0
    const increaseBetAfterSeedReset = mode === 'wager' ? optFrom(currentOpts, 'increaseBetAfterSeedReset', 0) : 0

    if (mode === 'wager' && seedChangeAfterRolls > 0) {
      const isFirstBetOfBlock = rollsInCurrentSeedBlock === 0
      if (isFirstBetOfBlock) {
        if (!lastRotatedOnLoss) {
          try {
            const rotated = await rotateSeedPair()
            if (!rotated?.ok) callbacks.onLog?.('Seed-Rotation fehlgeschlagen (nächster Block nutzt alten Seed).')
          } catch (e) {
            callbacks.onLog?.('Seed-Rotation Fehler: ' + (e instanceof Error ? e.message : String(e)))
          }
        }
        lastRotatedOnLoss = false
        if (increaseBetAfterSeedReset > 0) {
          currentBlockBase = initialBetSizeWager + blockIndex * increaseBetAfterSeedReset
          betSizeUsd = currentBlockBase
          if (blockIndex > 0) callbacks.onSeedReset?.(blockIndex, betSizeUsd)
        }
        blockIndex++
      }
    }

    const amountToPlace = toAmount(betSizeUsd)
    let wageredUsdThisRound = betSizeUsd
    if (currentGame !== 'blackjack') {
      totalWageredUsd += betSizeUsd
    }
    const opts = currentOpts
    try {
      if (currentGame === 'blackjack') {
        const res = await playBlackjackScriptRound({
          amount: amountToPlace,
          currency: cur,
          signal,
          onLog: callbacks.onLog,
        })
        payout = res.payout
        wageredUsdThisRound = currencyAmountToUsd(res.amount, cur, usdRates)
        totalWageredUsd += wageredUsdThisRound
      } else if (currentGame === 'dice') {
        const rollUnder = optFrom(opts, 'rollUnder', 49.5)
        const rollOver = Boolean(opts.rollOver)
        const res = await placeDiceBet({
          amount: amountToPlace,
          currency: cur,
          rollUnder,
          rollOver,
        })
        payout = res?.payout ?? 0
      } else if (currentGame === 'limbo') {
        const mult = optFrom(opts, 'targetMultiplier', 2)
        const res = await placeLimboBet({ amount: amountToPlace, currency: cur, targetMultiplier: mult })
        payout = res?.payout ?? 0
      } else if (currentGame === 'plinko') {
        const rows = optFrom(opts, 'rows', 16)
        const risk = String(opts.plinkoRisk || opts.risk || 'low').toLowerCase()
        const res = await placePlinkoBet({ amount: amountToPlace, currency: cur, rows, risk: risk as 'low' | 'medium' | 'high' })
        payout = res?.payout ?? 0
      } else if (currentGame === 'keno') {
        const useHeatmap = optBoolFrom(opts, 'useHeatmapHotNumbers', false) && optFrom(opts, 'heatmapHotNumbers', 0) > 0
        const useRandomEachBet = optFrom(opts, 'randomNumbersFrom', 0) > 0 || optFrom(opts, 'randomNumbersTo', 0) > 0
        const fixedNumbers = (opts.numbers as number[]) || []
        let numbers: number[]
        if (useHeatmap) {
          const hotCount = Math.max(1, Math.min(10, optFrom(opts, 'heatmapHotNumbers', 5)))
          const range = Math.max(1, Math.min(39, optFrom(opts, 'heatmapRange', 30)))
          const hotPool = shuffle(Array.from({ length: range }, (_, i) => i + 1))
          numbers = hotPool.slice(0, hotCount)
        } else if (useRandomEachBet) {
          const from = optFrom(opts, 'randomNumbersFrom', 8)
          const to = optFrom(opts, 'randomNumbersTo', 8)
          const lo = Math.min(from, to)
          const hi = Math.max(from, to)
          const countRaw = getRandomInt(Math.max(0, lo), Math.max(0, hi)) || 8
          const count = Math.max(1, Math.min(10, countRaw))
          const pool = shuffle(Array.from({ length: 39 }, (_, i) => i + 1))
          numbers = pool.slice(0, count)
        } else if (Array.isArray(fixedNumbers) && fixedNumbers.length > 0) {
          numbers = fixedNumbers.filter((n) => n >= 1 && n <= 39).slice(0, 10)
        } else {
          const count = 8
          const pool = shuffle(Array.from({ length: 39 }, (_, i) => i + 1))
          numbers = pool.slice(0, count)
        }
        if (numbers.length === 0) numbers = [1]
        const riskRaw = String(opts.risk || 'medium').toLowerCase()
        const risk = riskRaw === 'classic' ? 'medium' : riskRaw
        const res = await placeKenoBet({
          amount: amountToPlace,
          currency: cur,
          picks: numbers,
          risk: risk as 'low' | 'medium' | 'high',
        })
        payout = res?.payout ?? 0
      } else if (currentGame === 'mines') {
        const mines = Math.min(24, Math.max(1, optFrom(opts, 'mines', 3)))
        const diamonds = Math.min(24, Math.max(1, optFrom(opts, 'diamonds', 2)))
        const res = await placeMinesBet({ amount: amountToPlace, currency: cur, mineCount: mines })
        if (!res?.id && !res?.iid) {
          profitUsd -= betSizeUsd
          break
        }
        const identifier = (res as { id?: string; iid?: string }).id ?? (res as { iid?: string }).iid ?? ''
        let gemsRevealed = 0
        const indices = shuffle(Array.from({ length: GRID_SIZE }, (_, i) => i))
        for (const idx of indices) {
          if (signal.cancelled || gemsRevealed >= diamonds) break
          const rev = await minesReveal({ identifier, fields: [idx] })
          if (!rev || (rev as { active?: boolean }).active === false) break
          gemsRevealed++
        }
        if (gemsRevealed >= diamonds) {
          const cash = await minesCashout({ identifier })
          payout = cash?.payout ?? 0
        }
      } else {
        callbacks.onLog?.('Unbekanntes Spiel: ' + currentGame)
        break
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.('Fehler: ' + msg)
      callbacks.onBetPlaced?.({ error: msg })
      break
    }

    const payoutUsd = currencyAmountToUsd(payout, cur, usdRates)
    const win = payout > 0
    profitUsd += payoutUsd - wageredUsdThisRound

    // B2B Multi: Faktor der aktuellen BetSize relativ zum Start der B2B-Kette
    const isB2bMode = ((opts.onWin as string) || '') === 'b2b'
    if (isB2bMode) {
      if (!lastWin) b2bChainBaseUsd = wageredUsdThisRound
    } else {
      b2bChainBaseUsd = 0
    }
    const b2bMulti = isB2bMode && b2bChainBaseUsd > 0 ? wageredUsdThisRound / b2bChainBaseUsd : 0
    const multi = wageredUsdThisRound > 0 ? payoutUsd / wageredUsdThisRound : 0

    if (win) {
      wins++
      currentStreak = lastWin ? currentStreak + 1 : 1
      b2bCount++
      applyWinFor(currentOpts, payout)
    } else {
      losses++
      currentStreak = lastWin ? 0 : currentStreak - 1
      b2bCount = 0
      applyLossFor(currentOpts)
    }
    lastWin = win

    const seedResetOnLossStreak = mode === 'wager' ? optFrom(currentOpts, 'seedResetOnLossStreak', 0) : 0
    const resetSeedOnLoss = mode === 'wager' ? optBoolFrom(currentOpts, 'resetSeedOnLoss', false) : false
    const seedResetOnLossAmount = mode === 'wager' ? optFrom(currentOpts, 'seedResetOnLossAmount', 0) : 0

    if (mode === 'wager' && !win && seedResetOnLossStreak > 0 && -currentStreak >= seedResetOnLossStreak) {
      try {
        const rotated = await rotateSeedPair()
        if (rotated?.ok) callbacks.onLog?.(`Seed-Rotation nach ${-currentStreak} Loss-Streak.`)
        else callbacks.onLog?.('Seed-Rotation (Loss-Streak) fehlgeschlagen.')
      } catch (e) {
        callbacks.onLog?.('Seed-Rotation Fehler: ' + (e instanceof Error ? e.message : String(e)))
      }
    }

    if (mode === 'wager' && !win && resetSeedOnLoss) {
      try {
        const rotated = await rotateSeedPair()
        if (rotated?.ok) {
          if (seedChangeAfterRolls > 0) {
            rollsInCurrentSeedBlock = 0
            lastRotatedOnLoss = true
          }
          callbacks.onLog?.('Seed & Session nach Verlust zurückgesetzt.')
        } else {
          callbacks.onLog?.('Seed-Reset bei Verlust fehlgeschlagen.')
        }
      } catch (e) {
        callbacks.onLog?.('Seed-Reset Fehler: ' + (e instanceof Error ? e.message : String(e)))
      }
    }

    if (mode === 'wager' && seedResetOnLossAmount > 0 && profitUsd <= -seedResetOnLossAmount) {
      if (!seedResetLossAmountTriggered) {
        try {
          const rotated = await rotateSeedPair()
          if (rotated?.ok) {
            if (seedChangeAfterRolls > 0) {
              rollsInCurrentSeedBlock = 0
              lastRotatedOnLoss = true
            }
            seedResetLossAmountTriggered = true
            callbacks.onLog?.(`Seed & Session zurückgesetzt (Verlust ≥ $${seedResetOnLossAmount}).`)
          } else {
            callbacks.onLog?.('Seed-Reset bei Verlust (USD) fehlgeschlagen.')
          }
        } catch (e) {
          callbacks.onLog?.('Seed-Reset Fehler: ' + (e instanceof Error ? e.message : String(e)))
        }
      }
    } else if (profitUsd > -seedResetOnLossAmount) {
      seedResetLossAmountTriggered = false
    }

    if (mode === 'wager' && seedChangeAfterRolls > 0) {
      rollsInCurrentSeedBlock++
      if (rollsInCurrentSeedBlock >= seedChangeAfterRolls) rollsInCurrentSeedBlock = 0
    }

    // Recovery: Wechsel zu 2. Spiel bei Verlust/Streak, zurück wenn profit >= 0
    if (hasRecovery && mode === 'wager') {
      const triggerHit = recoveryTrigger === 'lossStreak' ? (-currentStreak >= recoveryTriggerValue) : (recoveryTrigger === 'profitBelow' && profitUsd <= recoveryTriggerValue)
      if (triggerHit) {
        mode = 'recovery'
        currentOpts = recoveryOptions!
        currentGame = (recoveryOptions!.game as string) || 'limbo'
        betSizeUsd = initialBetSizeRec
        lastWin = false
        currentStreak = 0
        callbacks.onLog?.(`→ Recovery (${currentGame}) – nach ${recoveryTrigger === 'lossStreak' ? -currentStreak + ' Loss-Streak' : 'Profit ≤ ' + recoveryTriggerValue}`)
      }
    }
    if (hasRecovery && mode === 'recovery') {
      const endHit = recoveryEndTrigger === 'profitNonNegative' ? (profitUsd >= 0) : (recoveryEndTrigger === 'winStreak' && currentStreak >= recoveryEndValue)
      if (endHit) {
        mode = 'wager'
        currentOpts = options
        currentGame = (options.game as string) || 'dice'
        betSizeUsd = initialBetSizeWager
        currentBlockBase = initialBetSizeWager
        lastWin = false
        currentStreak = 0
        callbacks.onLog?.(`→ Wager (${currentGame}) – Recovery abgeschlossen`)
      }
    }

    callbacks.onBetPlaced?.({
      iid: undefined,
      payout,
      amount: amountToPlace,
      game: currentGame,
      betSizeUsd: wageredUsdThisRound,
      payoutUsd,
      profitUsd,
      multi,
      b2bMulti,
    })
    callbacks.onStats?.({ bets: rollNumber, profit: profitUsd, wins, losses, totalWagered: totalWageredUsd })

    if (stopOnProfit > 0 && profitUsd >= stopOnProfit) break
    if (stopOnLoss > 0 && profitUsd <= -stopOnLoss) break
    if (stopOnWinStreak > 0 && currentStreak >= stopOnWinStreak) break
    if (stopOnLossStreak > 0 && -currentStreak >= stopOnLossStreak) break
    if (stopOnB2bStreak > 0 && b2bCount >= stopOnB2bStreak) break
  }
}
