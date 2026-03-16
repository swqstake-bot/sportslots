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

const GRID_SIZE = 25

export interface ProfileRunnerCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (result: { iid?: string; payout?: number; amount?: number; error?: string }) => void
  onStats?: (stats: { bets: number; profit: number; wins: number; losses: number }) => void
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

/** Nimmt Antebot-style options (camelCase) und führt Session aus. Einsatz (initialBetSize/betSize) = USD; bei usdRates wird in die gewählte Währung umgerechnet. */
export async function runProfile(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ProfileRunnerCallbacks,
  signal: { cancelled: boolean },
  usdRates?: Record<string, number>
): Promise<void> {
  const game = (options.game as string) || 'keno'
  const opt = (key: string, def: number) => (options[key] as number) ?? def
  const optBool = (key: string, def: boolean) => (options[key] as boolean) ?? def

  const cur = (currency || 'usdc').toLowerCase()
  const toAmount = (usd: number) => usdToCurrencyAmount(usd, cur, usdRates)

  let betSizeUsd = Math.max(0.00000001, Number(options.initialBetSize) || Number(options.betSize) || 0.01)
  const initialBetSize = betSizeUsd
  let currentBlockBase = initialBetSize
  let profit = 0
  let wins = 0
  let losses = 0
  let rollNumber = 0
  let currentStreak = 0
  let lastWin = false
  let b2bCount = 0

  const stopOnProfit = opt('stopOnProfit', 0)
  const stopOnLoss = opt('stopOnLoss', 0)
  const stopOnWinStreak = optBool('isStopOnWinStreak', false) ? opt('stopOnWinStreak', 0) : 0
  const stopOnLossStreak = optBool('isStopOnLossStreak', false) ? opt('stopOnLossStreak', 0) : 0
  const stopOnB2bStreak = optBool('isStopOnB2bStreak', false) ? opt('stopOnB2bStreak', 0) : 0
  const onWin = (options.onWin as string) || 'reset'
  const onLoss = (options.onLoss as string) || 'reset'
  const increaseOnLoss = opt('increaseOnLoss', 0)
  const seedChangeAfterRolls = optBool('isSeedChangeAfterRolls', false) ? opt('seedChangeAfterRolls', 0) : 0
  const increaseBetAfterSeedReset = opt('increaseBetAfterSeedReset', 0)

  const applyWin = () => {
    if (onWin === 'none') return
    if (onWin === 'reset' || onWin === 'martingale') betSizeUsd = initialBetSize
    else if (onWin === 'increase') betSizeUsd = betSizeUsd * (1 + (opt('increaseOnWin', 0) / 100))
  }
  const applyLoss = () => {
    if (onLoss === 'none') return
    if (onLoss === 'reset') {
      betSizeUsd = (seedChangeAfterRolls > 0 && increaseBetAfterSeedReset > 0) ? currentBlockBase : initialBetSize
    } else if (onLoss === 'martingale') betSizeUsd = betSizeUsd * 2
    else if (onLoss === 'increase') betSizeUsd = betSizeUsd * (1 + increaseOnLoss / 100)
  }

  while (!signal.cancelled) {
    rollNumber++
    let payout = 0

    if (seedChangeAfterRolls > 0) {
      const tierIndex = Math.floor((rollNumber - 1) / seedChangeAfterRolls)
      const isFirstBetOfBlock = (rollNumber - 1) % seedChangeAfterRolls === 0
      if (isFirstBetOfBlock) {
        try {
          const rotated = await rotateSeedPair()
          if (!rotated?.ok) callbacks.onLog?.('Seed-Rotation fehlgeschlagen (nächster Block nutzt alten Seed).')
        } catch (e) {
          callbacks.onLog?.('Seed-Rotation Fehler: ' + (e instanceof Error ? e.message : String(e)))
        }
        if (increaseBetAfterSeedReset > 0) {
          currentBlockBase = initialBetSize + tierIndex * increaseBetAfterSeedReset
          betSizeUsd = currentBlockBase
          if (tierIndex > 0) callbacks.onSeedReset?.(tierIndex, betSizeUsd)
        }
      }
    }

    const amountToPlace = toAmount(betSizeUsd)
    try {
      if (game === 'dice') {
        const rollUnder = opt('rollUnder', 49.5)
        const rollOver = Boolean(options.rollOver)
        const res = await placeDiceBet({
          amount: amountToPlace,
          currency: cur,
          rollUnder,
          rollOver,
        })
        payout = res?.payout ?? 0
      } else if (game === 'limbo') {
        const mult = opt('targetMultiplier', 2)
        const res = await placeLimboBet({ amount: amountToPlace, currency: cur, targetMultiplier: mult })
        payout = res?.payout ?? 0
      } else if (game === 'plinko') {
        const rows = opt('rows', 16)
        const risk = String(options.plinkoRisk || options.risk || 'low').toLowerCase()
        const res = await placePlinkoBet({ amount: amountToPlace, currency: cur, rows, risk: risk as 'low' | 'medium' | 'high' })
        payout = res?.payout ?? 0
      } else if (game === 'keno') {
        const useHeatmap = optBool('useHeatmapHotNumbers', false) && opt('heatmapHotNumbers', 0) > 0
        const useRandomEachBet = opt('randomNumbersFrom', 0) > 0 || opt('randomNumbersTo', 0) > 0
        const fixedNumbers = (options.numbers as number[]) || []
        let numbers: number[]
        if (useHeatmap) {
          const hotCount = Math.max(1, Math.min(10, opt('heatmapHotNumbers', 5)))
          const range = Math.max(1, Math.min(39, opt('heatmapRange', 30)))
          const hotPool = shuffle(Array.from({ length: range }, (_, i) => i + 1))
          numbers = hotPool.slice(0, hotCount)
        } else if (useRandomEachBet) {
          const from = opt('randomNumbersFrom', 8)
          const to = opt('randomNumbersTo', 8)
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
        const riskRaw = String(options.risk || 'medium').toLowerCase()
        const risk = riskRaw === 'classic' ? 'medium' : riskRaw
        const res = await placeKenoBet({
          amount: amountToPlace,
          currency: cur,
          picks: numbers,
          risk: risk as 'low' | 'medium' | 'high',
        })
        payout = res?.payout ?? 0
      } else if (game === 'mines') {
        const mines = Math.min(24, Math.max(1, opt('mines', 3)))
        const diamonds = Math.min(24, Math.max(1, opt('diamonds', 2)))
        const res = await placeMinesBet({ amount: amountToPlace, currency: cur, mineCount: mines })
        if (!res?.id && !res?.iid) {
          profit -= amountToPlace
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
        callbacks.onLog?.('Unbekanntes Spiel: ' + game)
        break
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.('Fehler: ' + msg)
      callbacks.onBetPlaced?.({ error: msg })
      break
    }

    const win = payout > 0
    profit += payout - amountToPlace
    if (win) {
      wins++
      currentStreak = lastWin ? currentStreak + 1 : 1
      b2bCount++
      applyWin()
    } else {
      losses++
      currentStreak = lastWin ? 0 : currentStreak - 1
      b2bCount = 0
      applyLoss()
    }
    lastWin = win

    callbacks.onBetPlaced?.({ iid: undefined, payout, amount: amountToPlace })
    callbacks.onStats?.({ bets: rollNumber, profit, wins, losses })

    if (stopOnProfit > 0 && profit >= stopOnProfit) break
    if (stopOnLoss > 0 && profit <= -stopOnLoss) break
    if (stopOnWinStreak > 0 && currentStreak >= stopOnWinStreak) break
    if (stopOnLossStreak > 0 && -currentStreak >= stopOnLossStreak) break
    if (stopOnB2bStreak > 0 && b2bCount >= stopOnB2bStreak) break
  }
}
