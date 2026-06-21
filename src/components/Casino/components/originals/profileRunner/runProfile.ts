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
import {
  isRetryableOriginalsScriptError,
  ORIGINALS_SCRIPT_RETRY_DELAY_MS,
} from '../scriptEngine/originalsScriptRetry'
import { createScriptHouseBetIdBridge } from '../scriptEngine/scriptHouseBetIdBridge'
import type { ScriptSessionStats } from '../scriptEngine/scriptSessionStats'

function pickBetIidFromResponse(res: unknown): string | undefined {
  if (!res || typeof res !== 'object') return undefined
  const r = res as { iid?: string; id?: string }
  const raw = String(r.iid ?? r.id ?? '').trim()
  return raw || undefined
}

type OriginalsBetApiRow = {
  amount?: number
  payout?: number
  payoutMultiplier?: number
}

/** Einsatz/Payout/Multi aus Stake-Response — nicht aus internem USD-Ziel (B2B-Rundung). */
function resolveOriginalsRoundUsd(
  betApi: OriginalsBetApiRow | null | undefined,
  amountPlaced: number,
  payoutRaw: number,
  currency: string,
  usdRates?: Record<string, number>
): {
  wageredUsd: number
  payoutUsd: number
  multi: number
  placedAmount: number
  payout: number
} {
  const placedAmount = Number(betApi?.amount ?? amountPlaced)
  const payout = Number(betApi?.payout ?? payoutRaw)
  const wageredUsd = currencyAmountToUsd(placedAmount, currency, usdRates)
  const payoutUsd = currencyAmountToUsd(payout, currency, usdRates)
  const win = payout > 0
  const apiMulti = Number(betApi?.payoutMultiplier)
  const multi =
    win && Number.isFinite(apiMulti) && apiMulti > 0
      ? apiMulti
      : win && wageredUsd > 0
        ? payoutUsd / wageredUsd
        : 0
  return { wageredUsd, payoutUsd, multi, placedAmount, payout }
}

const GRID_SIZE = 25

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export interface ProfileRunnerCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (result: {
    iid?: string
    /** Formatierte Share-ID (`casino:…` / `house:…`) zum Kopieren */
    betId?: string | null
    payout?: number
    amount?: number
    error?: string
    game?: string
    betIndex?: number
    betSizeUsd?: number
    payoutUsd?: number
    /** Gewinn/Verlust dieser Runde ($). */
    roundProfitUsd?: number
    /** Kumulativer Session-Profit ($). */
    profitUsd?: number
    multi?: number
    b2bMulti?: number
  }) => void
  /** houseBets liefert später `house:…` — UI-Zeile patchen */
  onBetShareId?: (betIndex: number, betId: string) => void
  onStats?: (stats: ScriptSessionStats) => void
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

/** Limbo: festes targetMultiplier oder Zufallsbereich targetMultiplierFrom/To (je Bet). */
function pickLimboTargetMultiplier(opts: Record<string, unknown>): number {
  const from = optFrom(opts, 'targetMultiplierFrom', 0)
  const to = optFrom(opts, 'targetMultiplierTo', 0)
  if (from > 0 && to > 0) {
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const raw = lo + Math.random() * (hi - lo)
    return Math.round(Math.max(1.01, raw) * 100) / 100
  }
  return Math.max(1.01, optFrom(opts, 'targetMultiplier', 2))
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

function resolveOnWin(o: Record<string, unknown>): string {
  return String(o.onWin ?? 'reset').toLowerCase().trim()
}

function isB2bOnWin(o: Record<string, unknown>): boolean {
  return resolveOnWin(o) === 'b2b'
}

type B2bTakeProfitCheck = {
  afterWins: number
  atChainMultiplier: number
  chainProfitPct: number
  chainProfitUsd: number
}

function readB2bTakeProfitOpts(o: Record<string, unknown>): B2bTakeProfitCheck {
  return {
    afterWins: optFrom(o, 'b2bTakeProfitAfterWins', 0),
    atChainMultiplier: optFrom(o, 'b2bTakeProfitAtChainMultiplier', 0),
    chainProfitPct: optFrom(o, 'b2bTakeProfitChainProfitPct', 0),
    chainProfitUsd: optFrom(o, 'b2bTakeProfitChainProfitUsd', 0),
  }
}

/** Prüft nach einem B2B-Gewinn, ob die Kette „ausbezahlt“ werden soll (OR über alle aktiven Regeln). */
function evaluateB2bTakeProfitReason(
  cfg: B2bTakeProfitCheck,
  ctx: {
    chainWins: number
    chainBaseUsd: number
    nextStakeUsd: number
    chainProfitUsd: number
  }
): string | null {
  if (cfg.afterWins > 0 && ctx.chainWins >= cfg.afterWins) {
    return `${ctx.chainWins} Gewinne in der B2B-Kette (≥ ${cfg.afterWins})`
  }
  if (cfg.atChainMultiplier > 0 && ctx.chainBaseUsd > 0 && ctx.nextStakeUsd >= ctx.chainBaseUsd * cfg.atChainMultiplier) {
    return `Einsatz $${ctx.nextStakeUsd.toFixed(4)} ≥ ${cfg.atChainMultiplier}× Kettenstart $${ctx.chainBaseUsd.toFixed(4)}`
  }
  if (cfg.chainProfitUsd > 0 && ctx.chainProfitUsd >= cfg.chainProfitUsd) {
    return `Ketten-Gewinn $${ctx.chainProfitUsd.toFixed(4)} ≥ $${cfg.chainProfitUsd}`
  }
  if (cfg.chainProfitPct > 0 && ctx.chainBaseUsd > 0) {
    const need = (ctx.chainBaseUsd * cfg.chainProfitPct) / 100
    if (ctx.chainProfitUsd >= need) {
      return `Ketten-Gewinn $${ctx.chainProfitUsd.toFixed(4)} ≥ ${cfg.chainProfitPct}% von $${ctx.chainBaseUsd.toFixed(4)}`
    }
  }
  return null
}

/** 200 (Prozent) → 2×, 2 → 2× */
function pctOrMultiplierToRatio(v: number): number {
  if (v <= 0) return 0
  return v >= 10 ? v / 100 : v
}

type B2bSmartTpCfg = {
  atMulti: number
  atChainProfitUsd: number
  atChainProfitPctOfBase: number
  peelPct: number
}

function readB2bSmartTpOpts(o: Record<string, unknown>): B2bSmartTpCfg {
  return {
    atMulti: pctOrMultiplierToRatio(optFrom(o, 'b2bSmartTakeProfitAtMulti', 0)),
    atChainProfitUsd: optFrom(o, 'b2bSmartTakeProfitAtChainProfitUsd', 0),
    atChainProfitPctOfBase: pctOrMultiplierToRatio(optFrom(o, 'b2bSmartTakeProfitAtChainProfitPctOfBase', 0)),
    peelPct: optFrom(o, 'b2bSmartTakeProfitPeelPct', 0),
  }
}

function hasB2bSmartTpRules(cfg: B2bSmartTpCfg): boolean {
  return cfg.peelPct > 0 && (cfg.atMulti > 0 || cfg.atChainProfitUsd > 0 || cfg.atChainProfitPctOfBase > 0)
}

/**
 * Smart B2B: weiter reinvestieren, aber peelPct % eines Pools sichern (nicht auf Base zurück).
 * Trigger (OR): Einsatz÷Base ≥ atMulti · Ketten-Gewinn ≥ USD · Ketten-Gewinn ≥ Base×Ratio.
 */
function applyB2bSmartPartialTakeProfit(
  nextStakeUsd: number,
  baseUsd: number,
  chainProfitUsd: number,
  cfg: B2bSmartTpCfg
): { reinvestUsd: number; peeledUsd: number; applied: boolean } {
  if (!hasB2bSmartTpRules(cfg) || nextStakeUsd <= 0 || baseUsd <= 0) {
    return { reinvestUsd: nextStakeUsd, peeledUsd: 0, applied: false }
  }

  const stakeRatio = nextStakeUsd / baseUsd
  const chainProfitRatio = chainProfitUsd / baseUsd
  const stakeHit = cfg.atMulti > 0 && stakeRatio >= cfg.atMulti
  const chainUsdHit = cfg.atChainProfitUsd > 0 && chainProfitUsd >= cfg.atChainProfitUsd
  const chainPctHit = cfg.atChainProfitPctOfBase > 0 && chainProfitRatio >= cfg.atChainProfitPctOfBase

  if (!stakeHit && !chainUsdHit && !chainPctHit) {
    return { reinvestUsd: nextStakeUsd, peeledUsd: 0, applied: false }
  }

  const excessUsd = Math.max(0, nextStakeUsd - baseUsd)
  let peelPoolUsd = excessUsd
  if (chainUsdHit || chainPctHit) {
    peelPoolUsd = Math.max(peelPoolUsd, Math.min(nextStakeUsd, chainProfitUsd))
  }
  peelPoolUsd = Math.min(peelPoolUsd, nextStakeUsd)

  const peeledUsd = peelPoolUsd * (cfg.peelPct / 100)
  const reinvestUsd = Math.max(baseUsd, nextStakeUsd - peeledUsd)
  return { reinvestUsd, peeledUsd, applied: peeledUsd > 0.00000001 }
}

/** Nimmt Antebot-style options (camelCase) und führt Session aus. Optional: recoveryGame + recoveryTrigger → bei Verlust/Streak Wechsel zu Recovery-Spiel, nach Erholung zurück. */
export async function runProfile(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ProfileRunnerCallbacks,
  signal: { cancelled: boolean },
  usdRates?: Record<string, number>,
  accessToken?: string
): Promise<void> {
  const houseBetBridge = createScriptHouseBetIdBridge(accessToken, callbacks.onBetShareId)
  try {
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
  let b2bChainWins = 0
  /** Produkt der Rund-Multiplikatoren in der aktuellen B2B-Kette (3.5×3.5=12.25). */
  let b2bChainMultiProduct = 1
  let b2bChainBaseUsd = 0
  let b2bChainStartProfitUsd = 0
  let b2bTakeProfitCount = 0
  let b2bSecuredUsd = 0
  let effectiveBaseUsd = initialBetSizeWager
  let rollsInCurrentSeedBlock = 0
  let blockIndex = 0
  let lastRotatedOnLoss = false
  let seedResetLossAmountTriggered = false

  const sessionStartMs = Date.now()
  let maxMulti = 0
  let maxB2bMulti = 0
  let maxWinUsd = 0
  let maxRoundProfitUsd = 0
  let maxBetUsd = 0
  let longestB2bStreak = 0
  let longestWinStreak = 0

  const stopOnProfit = optFrom(options, 'stopOnProfit', 0)
  const stopOnLoss = optFrom(options, 'stopOnLoss', 0)
  const stopOnTotalWagered = optFrom(options, 'stopOnTotalWagered', 0)
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
    effectiveBaseUsd = stageInitial
    rollsInCurrentSeedBlock = 0
    lastRotatedOnLoss = false
    blockIndex = 0
    lastWin = false
    currentStreak = 0
    b2bChainBaseUsd = 0
    b2bChainWins = 0
    b2bChainStartProfitUsd = profitUsd
    callbacks.onLog?.(`→ Rotation: ${stage.game.toUpperCase()} (${rotationBetsLeft} Bets)`)
  }
  if (rotationStages.length > 0) applyRotationStage(0)

  const applyWinFor = (
    opts: Record<string, unknown>,
    lastPayoutCurrency: number,
    lastPayoutUsd?: number
  ) => {
    const onWin = resolveOnWin(opts)
    const initialForMode = opts === recoveryOptions ? initialBetSizeRec : initialBetSizeWager
    if (onWin === 'none') return
    if (onWin === 'reset' || onWin === 'martingale') {
      betSizeUsd = opts === recoveryOptions ? initialForMode : effectiveBaseUsd
    } else if (onWin === 'increase') {
      betSizeUsd = betSizeUsd * (1 + optFrom(opts, 'increaseOnWin', 0) / 100)
    } else if (onWin === 'b2b') {
      const nextUsd =
        lastPayoutUsd != null && lastPayoutUsd > 0
          ? lastPayoutUsd
          : currencyAmountToUsd(lastPayoutCurrency, cur, usdRates)
      if (Number.isFinite(nextUsd) && nextUsd > 0) {
        betSizeUsd = Math.max(0.00000001, nextUsd)
      }
    }
  }
  const applyLossFor = (opts: Record<string, unknown>) => {
    const onLoss = (opts.onLoss as string) || 'reset'
    const initialForMode = opts === recoveryOptions ? initialBetSizeRec : initialBetSizeWager
    const seedRolls = optFrom(opts, 'seedChangeAfterRolls', 0)
    const incAfter = optFrom(opts, 'increaseBetAfterSeedReset', 0)
    if (onLoss === 'none') return
    if (onLoss === 'reset') {
      const base = opts === recoveryOptions ? initialForMode : effectiveBaseUsd
      betSizeUsd = seedRolls > 0 && incAfter > 0 ? currentBlockBase : base
    } else if (onLoss === 'martingale') betSizeUsd = betSizeUsd * 2
    else if (onLoss === 'increase') betSizeUsd = betSizeUsd * (1 + (optFrom(opts, 'increaseOnLoss', 0) / 100))
  }

  while (!signal.cancelled) {
    rollNumber++
    let payout = 0
    let betIid: string | undefined

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
            await rotateSeedPair()
          } catch {
            /* no routine log spam */
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

    const profitUsdBeforeRound = profitUsd
    const amountToPlace = toAmount(betSizeUsd)
    let wageredUsdThisRound = betSizeUsd
    let betApi: OriginalsBetApiRow | null = null
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
        betIid = pickBetIidFromResponse(res)
        betApi = res
      } else if (currentGame === 'limbo') {
        const mult = pickLimboTargetMultiplier(opts)
        const res = await placeLimboBet({ amount: amountToPlace, currency: cur, targetMultiplier: mult })
        payout = res?.payout ?? 0
        betIid = pickBetIidFromResponse(res)
        betApi = res
      } else if (currentGame === 'plinko') {
        const rows = optFrom(opts, 'rows', 16)
        const risk = String(opts.plinkoRisk || opts.risk || 'low').toLowerCase()
        const res = await placePlinkoBet({ amount: amountToPlace, currency: cur, rows, risk: risk as 'low' | 'medium' | 'high' })
        payout = res?.payout ?? 0
        betIid = pickBetIidFromResponse(res)
        betApi = res
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
        betIid = pickBetIidFromResponse(res)
        betApi = res
      } else if (currentGame === 'mines') {
        const mines = Math.min(24, Math.max(1, optFrom(opts, 'mines', 3)))
        const diamonds = Math.min(24, Math.max(1, optFrom(opts, 'diamonds', 2)))
        const res = await placeMinesBet({ amount: amountToPlace, currency: cur, mineCount: mines })
        betIid = pickBetIidFromResponse(res)
        betApi = res
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
          if (cash) {
            const cashRow = cash as OriginalsBetApiRow
            betApi = {
              amount: betApi?.amount ?? (res as OriginalsBetApiRow | null)?.amount,
              payout: cashRow.payout,
              payoutMultiplier: cashRow.payoutMultiplier,
            }
          }
        }
      } else {
        callbacks.onLog?.('Unbekanntes Spiel: ' + currentGame)
        break
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isRetryableOriginalsScriptError(e) && !signal.cancelled) {
        callbacks.onLog?.(`Fehler — retry in 3s: ${msg.slice(0, 120)}`)
        rollNumber--
        await sleep(ORIGINALS_SCRIPT_RETRY_DELAY_MS)
        continue
      }
      callbacks.onLog?.('Fehler: ' + msg)
      callbacks.onBetPlaced?.({ error: msg })
      break
    }

    let payoutUsd: number
    let multi: number
    let placedAmountMajor = amountToPlace
    let win: boolean
    if (currentGame === 'blackjack') {
      payoutUsd = currencyAmountToUsd(payout, cur, usdRates)
      win = payout > 0
      multi = win && wageredUsdThisRound > 0 ? payoutUsd / wageredUsdThisRound : 0
    } else {
      const round = resolveOriginalsRoundUsd(betApi, amountToPlace, payout, cur, usdRates)
      wageredUsdThisRound = round.wageredUsd
      payout = round.payout
      payoutUsd = round.payoutUsd
      placedAmountMajor = round.placedAmount
      multi = round.multi
      win = payout > 0
      totalWageredUsd += round.wageredUsd
    }
    const roundProfitUsd = payoutUsd - wageredUsdThisRound
    profitUsd += roundProfitUsd

    const isB2bMode = isB2bOnWin(currentOpts)
    const b2bRefBaseUsd = effectiveBaseUsd

    if (isB2bMode) {
      if (!lastWin || b2bChainBaseUsd <= 0) {
        b2bChainBaseUsd = b2bRefBaseUsd
        b2bChainStartProfitUsd = profitUsdBeforeRound
      }
    } else {
      b2bChainBaseUsd = 0
      b2bChainWins = 0
      b2bChainMultiProduct = 1
    }

    const b2bTpCfg = readB2bTakeProfitOpts(currentOpts)
    const hasB2bTakeProfitRules =
      b2bTpCfg.afterWins > 0 ||
      b2bTpCfg.atChainMultiplier > 0 ||
      b2bTpCfg.chainProfitPct > 0 ||
      b2bTpCfg.chainProfitUsd > 0

    let tookB2bProfit = false
    if (win) {
      wins++
      currentStreak = lastWin ? currentStreak + 1 : 1
      b2bCount++

      if (isB2bMode) {
        b2bChainWins = lastWin ? b2bChainWins + 1 : 1
        const nextStakeUsd = currencyAmountToUsd(payout, cur, usdRates)
        const chainProfitUsd = profitUsd - b2bChainStartProfitUsd
        const tpReason = hasB2bTakeProfitRules
          ? evaluateB2bTakeProfitReason(b2bTpCfg, {
              chainWins: b2bChainWins,
              chainBaseUsd: b2bRefBaseUsd,
              nextStakeUsd: Number.isFinite(nextStakeUsd) && nextStakeUsd > 0 ? nextStakeUsd : 0,
              chainProfitUsd,
            })
          : null

        if (tpReason) {
          tookB2bProfit = true
          b2bTakeProfitCount += 1
          const escalateEvery = optFrom(currentOpts, 'b2bEscalateBaseEveryTakeProfits', 0)
          const escalatePct = optFrom(currentOpts, 'b2bEscalateBasePct', 0)
          const maxBase = optFrom(currentOpts, 'b2bMaxBaseBetUsd', 0)
          if (escalateEvery > 0 && escalatePct > 0 && b2bTakeProfitCount % escalateEvery === 0) {
            const cap = maxBase > 0 ? maxBase : Number.POSITIVE_INFINITY
            effectiveBaseUsd = Math.min(cap, effectiveBaseUsd * (1 + escalatePct / 100))
            currentBlockBase = effectiveBaseUsd
            b2bChainBaseUsd = effectiveBaseUsd
          }
          betSizeUsd = effectiveBaseUsd
          b2bChainBaseUsd = 0
          b2bChainWins = 0
          b2bChainMultiProduct = 1
          b2bChainStartProfitUsd = profitUsd
          if (mode === 'wager' && optBoolFrom(currentOpts, 'b2bRotateSeedOnTakeProfit', false)) {
            try {
              const rotated = await rotateSeedPair()
              if (rotated?.ok && seedChangeAfterRolls > 0) {
                rollsInCurrentSeedBlock = 0
                lastRotatedOnLoss = false
              }
            } catch {
              /* still: no routine log spam */
            }
          }
        } else {
          const nextStakeUsd =
            Number.isFinite(payoutUsd) && payoutUsd > 0
              ? payoutUsd
              : currencyAmountToUsd(payout, cur, usdRates)
          const smart = applyB2bSmartPartialTakeProfit(
            nextStakeUsd,
            b2bRefBaseUsd,
            chainProfitUsd,
            readB2bSmartTpOpts(currentOpts)
          )
          if (smart.applied) {
            b2bSecuredUsd += smart.peeledUsd
            betSizeUsd = smart.reinvestUsd
          } else {
            applyWinFor(currentOpts, payout, payoutUsd)
          }
        }
      } else {
        applyWinFor(currentOpts, payout, payoutUsd)
      }

    } else {
      losses++
      currentStreak = lastWin ? 0 : currentStreak - 1
      b2bCount = 0
      b2bChainWins = 0
      b2bChainBaseUsd = 0
      b2bChainMultiProduct = 1
      b2bChainStartProfitUsd = profitUsd
      applyLossFor(currentOpts)
    }

    // B2B Multi = Produkt der Gewinn-Multis in der Kette (3.5×3.5=12.25); Verlust → —
    let b2bMulti = 0
    if (isB2bMode && win && multi > 0) {
      b2bMulti = lastWin ? b2bChainMultiProduct * multi : multi
      b2bChainMultiProduct = tookB2bProfit ? 1 : b2bMulti
    }

    lastWin = tookB2bProfit ? false : win

    const seedResetOnLossStreak = mode === 'wager' ? optFrom(currentOpts, 'seedResetOnLossStreak', 0) : 0
    const resetSeedOnLoss = mode === 'wager' ? optBoolFrom(currentOpts, 'resetSeedOnLoss', false) : false
    const seedResetOnLossAmount = mode === 'wager' ? optFrom(currentOpts, 'seedResetOnLossAmount', 0) : 0

    if (mode === 'wager' && !win && seedResetOnLossStreak > 0 && -currentStreak >= seedResetOnLossStreak) {
      try {
        await rotateSeedPair()
      } catch {
        /* no routine log spam */
      }
    }

    if (mode === 'wager' && !win && resetSeedOnLoss) {
      try {
        const rotated = await rotateSeedPair()
        if (rotated?.ok && seedChangeAfterRolls > 0) {
          rollsInCurrentSeedBlock = 0
          lastRotatedOnLoss = true
        }
      } catch {
        /* no routine log spam */
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
          }
        } catch {
          /* no routine log spam */
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
        effectiveBaseUsd = initialBetSizeWager
        lastWin = false
        currentStreak = 0
        callbacks.onLog?.(`→ Wager (${currentGame}) – Recovery abgeschlossen`)
      }
    }

    maxMulti = Math.max(maxMulti, multi)
    if (win && b2bMulti > 0) maxB2bMulti = Math.max(maxB2bMulti, b2bMulti)
    maxBetUsd = Math.max(maxBetUsd, wageredUsdThisRound)
    if (win) {
      maxWinUsd = Math.max(maxWinUsd, payoutUsd)
      const roundProfit = payoutUsd - wageredUsdThisRound
      if (roundProfit > 0) maxRoundProfitUsd = Math.max(maxRoundProfitUsd, roundProfit)
    }
    if (currentStreak > 0) longestWinStreak = Math.max(longestWinStreak, currentStreak)
    if (isB2bMode && b2bChainWins > 0) longestB2bStreak = Math.max(longestB2bStreak, b2bChainWins)

    const sessionElapsedMs = Date.now() - sessionStartMs
    const betsPerSec = sessionElapsedMs >= 200 ? rollNumber / (sessionElapsedMs / 1000) : 0

    houseBetBridge.registerPending({
      betIndex: rollNumber,
      at: Date.now(),
      currency: cur,
      amountMajor: placedAmountMajor,
      game: currentGame,
      payoutMultiplier: multi,
    })
    const betShareId = houseBetBridge.getShareId(rollNumber)
    callbacks.onBetPlaced?.({
      iid: betIid,
      betId: betShareId,
      payout,
      amount: placedAmountMajor,
      game: currentGame,
      betIndex: rollNumber,
      betSizeUsd: wageredUsdThisRound,
      payoutUsd,
      roundProfitUsd,
      profitUsd,
      multi,
      b2bMulti,
    })
    callbacks.onStats?.({
      bets: rollNumber,
      profit: profitUsd,
      wins,
      losses,
      totalWagered: totalWageredUsd,
      maxMulti,
      maxB2bMulti,
      maxWinUsd,
      maxRoundProfitUsd,
      maxBetUsd,
      longestB2bStreak,
      longestWinStreak,
      currentB2bStreak: isB2bMode ? b2bChainWins : 0,
      sessionElapsedMs,
      betsPerSec,
      b2bSecuredUsd,
    })

    if (stopOnProfit > 0 && profitUsd >= stopOnProfit) break
    if (stopOnLoss > 0 && profitUsd <= -stopOnLoss) break
    if (stopOnTotalWagered > 0 && totalWageredUsd >= stopOnTotalWagered) {
      callbacks.onLog?.(`Ziel-Wagered erreicht: $${totalWageredUsd.toFixed(2)} / $${stopOnTotalWagered}`)
      break
    }
    if (stopOnWinStreak > 0 && currentStreak >= stopOnWinStreak) break
    if (stopOnLossStreak > 0 && -currentStreak >= stopOnLossStreak) break
    if (stopOnB2bStreak > 0 && b2bCount >= stopOnB2bStreak) break
  }
  } finally {
    houseBetBridge.dispose()
  }
}
