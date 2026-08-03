/**
 * Profil-Runner: JSON-Profil parsen und Session gegen Stake-API ausführen.
 */

import { rotateSeedPair, fetchPacksProgress } from '../../../api/stakeOriginalsBets'
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
import { playBlackjackScriptRound } from '../blackjack/blackjackScriptRound'
import { placeOriginalsBet } from '../engine/placeOriginalsBet'
import {
  isRetryableOriginalsScriptError,
  ORIGINALS_SCRIPT_RETRY_DELAY_MS,
} from '../scriptEngine/originalsScriptRetry'
import { createScriptHouseBetIdBridge } from '../scriptEngine/scriptHouseBetIdBridge'
import type { ScriptSessionStats } from '../scriptEngine/scriptSessionStats'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { clampMultiplier, clampLimboMultiplier, LIMBO_MAX_MULTIPLIER } from '../games/targetMath'
import {
  advanceComboAfterRound,
  comboEngineControlsBetSize,
  createComboEngine,
  getComboBetParams,
  type ComboEngineState,
} from '../engine/comboEngine'
import {
  createB2bRuntime,
  recordB2bLoss,
  recordB2bWin,
  type B2bRuntimeState,
} from '../engine/b2bEngine'
import { checkWorkbenchStops } from '../engine/workbenchStops'
import { applyConditionBlocks } from '../engine/conditionsRunner'
import { waitWhilePaused, type SessionSignal } from '../engine/sessionSignal'
import { createVaultDeposit } from '../../../api/vaultApi'
import { isRateLimitError, TURBO_RATE_LIMIT_INTERVAL_BUMP_MS } from '../engine/turboConfig'

/** Cap for adaptive inter-bet delay added after 429s (sequential / Code Mode). */
const SEQ_RATE_LIMIT_EXTRA_CAP_MS = 500
/** Default ms added to pacing per 429 when settings omit the bump. */
const SEQ_RATE_LIMIT_DEFAULT_BUMP_MS = 10
/** After this many clean bets, ease one bump so pacing can recover. */
const SEQ_RATE_LIMIT_DECAY_AFTER_CLEAN_BETS = 40
import {
  resolveOriginalsRoundUsd,
  isB2bWinMode,
  resolveOnWinMode,
  buildPlacementContext,
  type OriginalsBetApiRow,
} from '../engine/originalsRoundResult'
import {
  createKenoHeatmapCycleRuntime,
  readKenoHeatmapCycleConfig,
  resolveKenoCycleRound,
  tickKenoHeatmapCycle,
} from '../keno/kenoHeatmapCycle'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
    /** Unix ms timestamp of this bet. */
    timestamp?: number
    /** Bet nonce string. */
    nonce?: string
    kenoPicks?: number[]
    kenoDrawn?: number[]
    kenoHits?: number
    diceTarget?: number
    diceResult?: number
    limboTarget?: number
    limboResult?: number
    minesCount?: number
    diamondsCount?: number
    minesSelected?: number[]
    minesLocations?: number[]
    hiloCards?: string
    hiloRank?: string
    hiloSuit?: string
    win?: boolean
  }) => void
  /** houseBets liefert später `house:…` — UI-Zeile patchen */
  onBetShareId?: (betIndex: number, betId: string) => void
  onStats?: (stats: ScriptSessionStats) => void
  /** Aufgerufen bei jedem „Seed-Reset“-Block (z. B. alle 25 Bets); Einsatz wird dann um increaseBetAfterSeedReset erhöht. */
  onSeedReset?: (tierIndex: number, newBetSize: number) => void
  onConditionStop?: () => void
  onResetStats?: () => void
  onResetSeed?: () => void
  onVaultDeposit?: (amount: number, currency: string) => void
  onTurboChange?: (enabled: boolean) => void
}

/** Limbo: festes targetMultiplier oder Zufallsbereich targetMultiplierFrom/To (je Bet). */
function pickLimboTargetMultiplier(opts: Record<string, unknown>): number {
  const from = optFrom(opts, 'targetMultiplierFrom', 0)
  const to = optFrom(opts, 'targetMultiplierTo', 0)
  if (from > 0 && to > 0) {
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const raw = lo + Math.random() * (hi - lo)
    return Math.round(clampLimboMultiplier(raw) * 100) / 100
  }
  return clampLimboMultiplier(optFrom(opts, 'targetMultiplier', 2))
}

function pickWorkbenchTargetMultiplier(
  opts: Record<string, unknown>,
  maxMultiplier = 9900
): number {
  const clamp = (n: number) =>
    maxMultiplier >= LIMBO_MAX_MULTIPLIER ? clampLimboMultiplier(n) : clampMultiplier(n, maxMultiplier)
  if (optBoolFrom(opts, 'isRandomMultiplier', false)) {
    const m1 = optFrom(opts, 'randomMultiplier1', 2)
    const m2 = optFrom(opts, 'randomMultiplier2', 10)
    const lo = Math.min(m1, m2)
    const hi = Math.max(m1, m2)
    if (lo > 0 && hi > 0) {
      return Math.round(clamp(lo + Math.random() * (hi - lo)) * 100) / 100
    }
  }
  const mode = String(opts.targetSelectionMode ?? 'static')
  if (mode === 'random') {
    if (maxMultiplier >= LIMBO_MAX_MULTIPLIER) return pickLimboTargetMultiplier(opts)
    const from = optFrom(opts, 'targetMultiplierFrom', 0)
    const to = optFrom(opts, 'targetMultiplierTo', 0)
    if (from > 0 && to > 0) {
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      return Math.round(clamp(lo + Math.random() * (hi - lo)) * 100) / 100
    }
  }
  return clamp(optFrom(opts, 'targetMultiplier', 2))
}

function applyDiceTargetFromMultiplier(opts: Record<string, unknown>, mult: number): Record<string, unknown> {
  const m = clampMultiplier(mult)
  const rollUnder = 99 / m
  return { ...opts, targetMultiplier: m, rollUnder }
}

/**
 * Rechnet Einsatz in USD in die Spielwährung um (1 Einheit Währung = usdRates[currency] USD).
 * Ohne usdRates wird der Wert 1:1 verwendet (Einsatz = Währungseinheiten).
 * GC/SC: Workbench-Wert ist immer native Major (HAR packs: gold 1000 / sweeps 0.1) — kein FX.
 */
function usdToCurrencyAmount(usdAmount: number, currency: string, usdRates?: Record<string, number>): number {
  if (usdAmount <= 0) return usdAmount
  if (isGoldCoinCurrency(currency)) return Math.round(usdAmount * 100) / 100
  if (!usdRates) return usdAmount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return usdAmount
  const amount = usdAmount / rate
  // Crypto: max 8 Dezimalstellen; Fiat/Stable: 2
  const isStable = ['usd', 'usdc', 'usdt', 'eur'].includes(currency.toLowerCase())
  return isStable ? Math.round(amount * 100) / 100 : Math.round(amount * 1e8) / 1e8
}

/** Rechnet Einsatz in Spielwährung zurück nach USD (inverse von usdToCurrencyAmount). */
function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (amount <= 0) return amount
  if (isGoldCoinCurrency(currency)) return Math.round(amount * 100) / 100
  if (!usdRates) return amount
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

/** Bet size in USD — allows 0. `||` must not be used (0 is valid). */
function readBetUsd(primary: unknown, secondary?: unknown, fallback = 0.01): number {
  for (const v of [primary, secondary]) {
    if (v === undefined || v === null || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallback
}
function optBoolFrom(o: Record<string, unknown>, key: string, def: boolean): boolean {
  return (o[key] as boolean) ?? def
}

function resolveOnWin(o: Record<string, unknown>, wb?: OriginalsWorkbenchOptions): string {
  return resolveOnWinMode(o, wb?.onWin)
}

function isB2bOnWin(o: Record<string, unknown>, wb?: OriginalsWorkbenchOptions): boolean {
  return isB2bWinMode(o, wb)
}

type B2bTakeProfitCheck = {
  afterWins: number
  atChainMultiplier: number
  chainProfitPct: number
  chainProfitUsd: number
}

function readB2bTakeProfitOpts(
  o: Record<string, unknown>,
  wb?: OriginalsWorkbenchOptions
): B2bTakeProfitCheck {
  const src = wb ? ({ ...o, ...wb } as Record<string, unknown>) : o
  return {
    afterWins: optFrom(src, 'b2bTakeProfitAfterWins', 0),
    atChainMultiplier: optFrom(src, 'b2bTakeProfitAtChainMultiplier', 0),
    chainProfitPct: optFrom(src, 'b2bTakeProfitChainProfitPct', 0),
    chainProfitUsd: optFrom(src, 'b2bTakeProfitChainProfitUsd', 0),
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

function readB2bSmartTpOpts(o: Record<string, unknown>, wb?: OriginalsWorkbenchOptions): B2bSmartTpCfg {
  const src = wb ? ({ ...o, ...wb } as Record<string, unknown>) : o
  return {
    atMulti: pctOrMultiplierToRatio(optFrom(src, 'b2bSmartTakeProfitAtMulti', 0)),
    atChainProfitUsd: optFrom(src, 'b2bSmartTakeProfitAtChainProfitUsd', 0),
    atChainProfitPctOfBase: pctOrMultiplierToRatio(
      optFrom(src, 'b2bSmartTakeProfitAtChainProfitPctOfBase', 0)
    ),
    peelPct: optFrom(src, 'b2bSmartTakeProfitPeelPct', 0),
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

/** Nimmt workbench-style options (camelCase) und führt Session aus. Optional: recoveryGame + recoveryTrigger → bei Verlust/Streak Wechsel zu Recovery-Spiel, nach Erholung zurück. */
export async function runProfile(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ProfileRunnerCallbacks,
  signal: SessionSignal,
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

  const initialBetSizeWager = readBetUsd(options.initialBetSize, options.betSize, 0.01)
  const initialBetSizeRec = recoveryOptions
    ? readBetUsd(recoveryOptions.initialBetSize, recoveryOptions.betSize, 0.01)
    : 0.01

  let betSizeUsd = initialBetSizeWager
  let currentBlockBase = initialBetSizeWager
  let profitUsd = 0
  let wins = 0
  let losses = 0
  let totalWageredUsd = 0
  let rollNumber = 0
  const betIndexOffset = Math.max(0, optFrom(options, '_betIndexOffset', 0))
  const toBetListIndex = (localRoll: number) => localRoll + betIndexOffset
  let currentStreak = 0
  let lastWin = false
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
  let peakProfitUsd = 0

  const workbenchEnabled = options._workbench === true
  let workbenchOptions: OriginalsWorkbenchOptions = {
    ...(options._workbenchOptions ?? {}) as OriginalsWorkbenchOptions,
  }
  const wbSessionSettings = (options._workbenchSettings ?? {}) as {
    clientSeed?: string
    maxFiatBetSize?: number
    requestIntervalAsyncMode?: number
    requestInterval?: number
    requestIntervalRateLimitIncrement?: number
  }
  const rateLimitBumpMs = (() => {
    const raw = wbSessionSettings.requestIntervalRateLimitIncrement
    if (raw == null || !Number.isFinite(Number(raw))) return SEQ_RATE_LIMIT_DEFAULT_BUMP_MS
    return Math.max(0, Number(raw))
  })()
  let adaptiveExtraDelayMs = 0
  let cleanBetsSinceRateLimit = 0
  const capBetUsd = (usd: number): number => {
    const max = wbSessionSettings.maxFiatBetSize ?? 0
    if (max > 0 && usd > max) return max
    return usd
  }
  const rotateSeed = () => rotateSeedPair(wbSessionSettings.clientSeed?.trim() || undefined)
  const getBaseRequestDelayMs = (): number => {
    if (workbenchOptions.asyncMode) {
      return wbSessionSettings.requestIntervalAsyncMode ?? workbenchOptions.requestInterval ?? 0
    }
    return workbenchOptions.requestInterval ?? wbSessionSettings.requestInterval ?? 0
  }
  const getRequestDelayMs = (): number => getBaseRequestDelayMs() + adaptiveExtraDelayMs
  const noteRateLimitHit = () => {
    if (rateLimitBumpMs <= 0) return
    const prev = adaptiveExtraDelayMs
    adaptiveExtraDelayMs = Math.min(SEQ_RATE_LIMIT_EXTRA_CAP_MS, adaptiveExtraDelayMs + rateLimitBumpMs)
    cleanBetsSinceRateLimit = 0
    if (adaptiveExtraDelayMs !== prev) {
      callbacks.onLog?.(
        `Rate limit — pacing +${rateLimitBumpMs}ms (delay now ${getRequestDelayMs()}ms)`
      )
    }
  }
  const noteSuccessfulBetForPacing = () => {
    if (adaptiveExtraDelayMs <= 0 || rateLimitBumpMs <= 0) return
    cleanBetsSinceRateLimit += 1
    if (cleanBetsSinceRateLimit < SEQ_RATE_LIMIT_DECAY_AFTER_CLEAN_BETS) return
    cleanBetsSinceRateLimit = 0
    adaptiveExtraDelayMs = Math.max(0, adaptiveExtraDelayMs - rateLimitBumpMs)
    callbacks.onLog?.(
      adaptiveExtraDelayMs > 0
        ? `Rate limit ease — delay now ${getRequestDelayMs()}ms`
        : 'Rate limit ease — back to base delay'
    )
  }
  const comboEngine: ComboEngineState | null = workbenchEnabled ? createComboEngine(workbenchOptions) : null
  const b2bRuntime: B2bRuntimeState | null = workbenchEnabled ? createB2bRuntime() : null
  let lastBetIdStr = ''
  let lastMultiForStop = 0
  let stopOnNextWinPending = false

  const minBetSizeUsd = optFrom(options, 'minBetSize', 0)
  let rollsSinceSwitch = 0
  let winsSinceSwitch = 0
  let lossesSinceSwitch = 0
  let winsSinceSeedChange = 0
  let lossesSinceSeedChange = 0
  let vaultDeposited = false

  const preRolls = mode === 'wager' ? Math.max(0, optFrom(options, 'preRolls', 0)) : 0
  const preRollsBetSizeUsd = (() => {
    const raw = options.preRollsBetSize
    if (raw === undefined || raw === null || raw === '') return initialBetSizeWager
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : initialBetSizeWager
  })()
  const kenoHeatmapCycleConfig =
    mode === 'wager' ? readKenoHeatmapCycleConfig(options, initialBetSizeWager) : null
  const kenoHeatmapCycleRuntime = kenoHeatmapCycleConfig
    ? createKenoHeatmapCycleRuntime(kenoHeatmapCycleConfig)
    : null

  const stopOnProfit = optFrom(options, 'stopOnProfit', 0)
  const stopOnLoss = optFrom(options, 'stopOnLoss', 0)
  const stopOnTotalWagered = optFrom(options, 'stopOnTotalWagered', 0)
  const stopOnWinStreak = optBoolFrom(options, 'isStopOnWinStreak', false) ? optFrom(options, 'stopOnWinStreak', 0) : 0
  const stopOnLossStreak = optBoolFrom(options, 'isStopOnLossStreak', false) ? optFrom(options, 'stopOnLossStreak', 0) : 0
  const stopOnB2bStreak = optBoolFrom(options, 'isStopOnB2bStreak', false) ? optFrom(options, 'stopOnB2bStreak', 0) : 0

  const huntPacksCards =
    workbenchEnabled &&
    !!workbenchOptions.huntPacksCards &&
    String(currentGame || workbenchOptions.game || options.game || '').toLowerCase() === 'packs'
  const huntPacksStake = huntPacksCards ? packsHuntAmountForCurrency(cur) : 0
  let lastPacksCollected: number | null = null
  let lastPacksProgressLogAt = 0
  let packsNewSinceLog: number[] = []
  if (huntPacksCards) {
    betSizeUsd = huntPacksStake
    currentBlockBase = huntPacksStake
    effectiveBaseUsd = huntPacksStake
    workbenchOptions = { ...workbenchOptions, numberOfBets: 0, initialBetSize: huntPacksStake, betSize: huntPacksStake }
    callbacks.onLog?.(
      `Hunt packs cards — stake ${huntPacksStake} ${cur.toUpperCase()} until ${PACKS_TOTAL_CARDS} cards (or Stop)`
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
    const stageInitial = readBetUsd(currentOpts.initialBetSize, currentOpts.betSize, initialBetSizeWager)
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

  const runSingleBetRound = async (
    betSizeUsdRound: number,
    optsRound: Record<string, unknown>,
    gameRound: string,
    isPreRoll = false
  ): Promise<{
    cancelled: boolean
    payout: number
    payoutUsd: number
    wageredUsdThisRound: number
    placedAmountMajor: number
    multi: number
    win: boolean
    betIid?: string
    betApi: OriginalsBetApiRow | null
    kenoPicks?: number[]
    kenoDrawn?: number[]
    kenoHits?: number
    diceTarget?: number
    diceResult?: number
    limboTarget?: number
    limboResult?: number
    minesCount?: number
    diamondsCount?: number
    minesSelected?: number[]
    minesLocations?: number[]
    hiloCards?: string
    hiloRank?: string
    hiloSuit?: string
  } | null> => {
    const amountToPlace = toAmount(capBetUsd(betSizeUsdRound))
    let wageredUsdThisRound = betSizeUsdRound
    let betApi: OriginalsBetApiRow | null = null
    let payout = 0
    let betIid: string | undefined
    let localOpts = { ...optsRound }
    try {
      if (gameRound === 'limbo') {
        localOpts = { ...localOpts, targetMultiplier: pickWorkbenchTargetMultiplier(localOpts, LIMBO_MAX_MULTIPLIER) }
      } else if (gameRound === 'dice') {
        const modeSel = String(localOpts.targetSelectionMode ?? 'static')
        if (modeSel === 'random' || optBoolFrom(localOpts, 'isRandomMultiplier', false)) {
          localOpts = applyDiceTargetFromMultiplier(localOpts, pickWorkbenchTargetMultiplier(localOpts))
        }
      }
      if (gameRound === 'blackjack') {
        const res = await playBlackjackScriptRound({
          amount: amountToPlace,
          currency: cur,
          signal,
          onLog: callbacks.onLog,
        })
        payout = res.payout
        wageredUsdThisRound = currencyAmountToUsd(res.amount, cur, usdRates)
      } else {
        const placed = await placeOriginalsBet(gameRound, localOpts, amountToPlace, cur, signal, callbacks.onLog)
        payout = placed.payout
        betIid = placed.betIid
        betApi = placed.betApi
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isRetryableOriginalsScriptError(e) && !signal.cancelled) {
        if (isRateLimitError(e)) noteRateLimitHit()
        const retryDelay = isRateLimitError(e)
          ? Math.min(30000, ORIGINALS_SCRIPT_RETRY_DELAY_MS + TURBO_RATE_LIMIT_INTERVAL_BUMP_MS * 4)
          : ORIGINALS_SCRIPT_RETRY_DELAY_MS
        callbacks.onLog?.(`Fehler — retry in ${Math.round(retryDelay / 1000)}s: ${msg.slice(0, 120)}`)
        await sleep(retryDelay)
        return null
      }
      callbacks.onLog?.('Fehler: ' + msg)
      callbacks.onBetPlaced?.({ error: msg })
      return { cancelled: true, payout: 0, payoutUsd: 0, wageredUsdThisRound: 0, placedAmountMajor: amountToPlace, multi: 0, win: false, betApi: null }
    }
    noteSuccessfulBetForPacing()
    let payoutUsd: number
    let multi: number
    let placedAmountMajor = amountToPlace
    let win: boolean
    let kenoPicks: number[] | undefined
    let kenoDrawn: number[] | undefined
    let kenoHits: number | undefined
    let diceTarget: number | undefined
    let diceResult: number | undefined
    let limboTarget: number | undefined
    let limboResult: number | undefined
    let minesCount: number | undefined
    let diamondsCount: number | undefined
    let minesSelected: number[] | undefined
    let minesLocations: number[] | undefined
    let hiloCards: string | undefined
    let hiloRank: string | undefined
    let hiloSuit: string | undefined
    if (gameRound === 'blackjack') {
      payoutUsd = currencyAmountToUsd(payout, cur, usdRates)
      win = payout > 0
      multi = win && wageredUsdThisRound > 0 ? payoutUsd / wageredUsdThisRound : 0
    } else {
      const placementCtx = buildPlacementContext(gameRound, localOpts)
      const round = resolveOriginalsRoundUsd(
        betApi,
        amountToPlace,
        payout,
        cur,
        usdRates,
        gameRound,
        placementCtx
      )
      wageredUsdThisRound = round.wageredUsd
      payout = round.payout
      payoutUsd = round.payoutUsd
      placedAmountMajor = round.placedAmount
      multi = round.multi
      win = round.win
      kenoPicks = round.kenoPicks
      kenoDrawn = round.kenoDrawn
      kenoHits = round.kenoHits
      diceTarget = round.diceTarget
      diceResult = round.diceResult
      limboTarget = round.limboTarget
      limboResult = round.limboResult
      minesCount = round.minesCount
      diamondsCount = round.diamondsCount
      minesSelected = round.minesSelected
      minesLocations = round.minesLocations
      hiloCards = round.hiloCards
      hiloRank = round.hiloRank
      hiloSuit = round.hiloSuit
    }
    if (isPreRoll) {
      callbacks.onLog?.(`Pre-roll: ${win ? 'win' : 'loss'} $${wageredUsdThisRound.toFixed(4)}`)
    }
    return {
      cancelled: false,
      payout,
      payoutUsd,
      wageredUsdThisRound,
      placedAmountMajor,
      multi,
      win,
      betIid,
      betApi,
      kenoPicks,
      kenoDrawn,
      kenoHits,
      diceTarget,
      diceResult,
      limboTarget,
      limboResult,
      minesCount,
      diamondsCount,
      minesSelected,
      minesLocations,
      hiloCards,
      hiloRank,
      hiloSuit,
    }
  }

  if (preRolls > 0 && !kenoHeatmapCycleRuntime) {
    callbacks.onLog?.(`Running ${preRolls} pre-roll warmup bet(s) at $${preRollsBetSizeUsd.toFixed(4)}`)
    for (let pr = 0; pr < preRolls && !signal.cancelled; pr++) {
      const preSize = capBetUsd(minBetSizeUsd > 0 ? Math.max(minBetSizeUsd, preRollsBetSizeUsd) : preRollsBetSizeUsd)
      const pre = await runSingleBetRound(preSize, currentOpts, currentGame, true)
      if (!pre || pre.cancelled) break
      totalWageredUsd += pre.wageredUsdThisRound
      profitUsd += pre.payoutUsd - pre.wageredUsdThisRound
      const delayMs = getRequestDelayMs()
      if (delayMs > 0) await sleep(delayMs)
    }
  }

  const applyWinFor = (
    opts: Record<string, unknown>,
    lastPayoutCurrency: number,
    lastPayoutUsd?: number
  ) => {
    const onWin = resolveOnWin(opts, workbenchEnabled ? workbenchOptions : undefined)
    const initialForMode = opts === recoveryOptions ? initialBetSizeRec : initialBetSizeWager
    if (onWin === 'none') return
    if (onWin === 'reset' || onWin === 'martingale') {
      betSizeUsd = opts === recoveryOptions ? initialForMode : effectiveBaseUsd
    } else if (onWin === 'increase') {
      betSizeUsd = betSizeUsd * (1 + optFrom(opts, 'increaseOnWin', 0) / 100)
    } else if (onWin === 'decrease') {
      const pct = optFrom(opts, 'increaseOnWin', 0)
      betSizeUsd = betSizeUsd * Math.max(0, 1 - pct / 100)
      if (minBetSizeUsd > 0) betSizeUsd = Math.max(minBetSizeUsd, betSizeUsd)
    } else if (onWin === 'b2b') {
      const nextUsd =
        lastPayoutUsd != null && lastPayoutUsd > 0
          ? lastPayoutUsd
          : currencyAmountToUsd(lastPayoutCurrency, cur, usdRates)
      if (Number.isFinite(nextUsd) && nextUsd > 0) {
        betSizeUsd = Math.max(0, nextUsd)
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
    }     else if (onLoss === 'martingale') betSizeUsd = betSizeUsd * 2
    else if (onLoss === 'increase') betSizeUsd = betSizeUsd * (1 + optFrom(opts, 'increaseOnLoss', 0) / 100)
    else if (onLoss === 'decrease') {
      const pct = optFrom(opts, 'increaseOnLoss', 0)
      betSizeUsd = betSizeUsd * Math.max(0, 1 - pct / 100)
      if (minBetSizeUsd > 0) betSizeUsd = Math.max(minBetSizeUsd, betSizeUsd)
    }
  }

  const conditionBlockCounters: Record<string, number> = {}

  while (!signal.cancelled) {
    if (await waitWhilePaused(signal)) break
    rollNumber++
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
            await rotateSeed()
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
    let betSizeUsdThisRound = huntPacksCards ? huntPacksStake : betSizeUsd

    if (workbenchEnabled && (workbenchOptions.conditionBlocks?.length ?? 0) > 0) {
      const condResult = applyConditionBlocks(workbenchOptions, {
        lastMulti: lastMultiForStop,
        lastWin,
        rollNumber: rollNumber - 1,
        profitUsd,
        peakProfitUsd,
        totalWageredUsd,
        currentStreak,
        betSizeUsd,
        conditionBlockCounters,
      })
      if (Object.keys(condResult.patch).length > 0) {
        workbenchOptions = { ...workbenchOptions, ...condResult.patch }
        currentOpts = { ...currentOpts, ...condResult.patch }
        options._workbenchOptions = workbenchOptions
      }
      const cActions = condResult.actions
      if (cActions.stop) { callbacks.onConditionStop?.(); signal.cancelled = true; break }
      if (cActions.resetStats) callbacks.onResetStats?.()
      if (cActions.resetSeed) { try { await rotateSeed() } catch { /* ignore */ }; callbacks.onResetSeed?.() }
      if (cActions.turboChange) callbacks.onTurboChange?.(cActions.turboChange === 'enable')
      if (cActions.depositToVault && cActions.depositToVault.amount > 0) {
        try {
          await createVaultDeposit(cur, cActions.depositToVault.amount)
          callbacks.onVaultDeposit?.(cActions.depositToVault.amount, cur)
          callbacks.onLog?.(`Vault deposit: ${cActions.depositToVault.amount.toFixed(4)} ${cur.toUpperCase()}`)
        } catch (e) {
          callbacks.onLog?.(`Vault deposit failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (cActions.setBetSize != null) betSizeUsd = Math.max(0, cActions.setBetSize)
      if (cActions.addBetSize != null) betSizeUsd = Math.max(0, betSizeUsd + cActions.addBetSize)
      if (cActions.multiplyBetSize != null) betSizeUsd = Math.max(0, betSizeUsd * cActions.multiplyBetSize)
      if (signal.cancelled) break
    }

    if (workbenchEnabled && comboEngine) {
      const params = getComboBetParams(workbenchOptions, comboEngine)
      if (comboEngineControlsBetSize(workbenchOptions)) {
        betSizeUsdThisRound = params.betSizeUsd
      }
      if (currentGame === 'dice' || currentGame === 'limbo') {
        currentOpts = { ...currentOpts, targetMultiplier: params.targetMultiplier }
        if (currentGame === 'dice') {
          const rollUnder = params.rollUnder ?? (params.targetMultiplier >= 1.01 ? 99 / params.targetMultiplier : 49.5)
          currentOpts = { ...currentOpts, rollUnder, targetMultiplier: params.targetMultiplier }
        }
      }
    }

    let roundOpts = currentOpts
    if (kenoHeatmapCycleRuntime && currentGame === 'keno') {
      const cycleRound = resolveKenoCycleRound(kenoHeatmapCycleRuntime, currentOpts)
      betSizeUsdThisRound = cycleRound.betSizeUsd
      roundOpts = cycleRound.opts
      if (cycleRound.log) callbacks.onLog?.(cycleRound.log)
    }

    if (minBetSizeUsd > 0) betSizeUsdThisRound = Math.max(minBetSizeUsd, betSizeUsdThisRound)
    if (!huntPacksCards) betSizeUsdThisRound = capBetUsd(betSizeUsdThisRound)

    houseBetBridge.registerPending({
      betIndex: toBetListIndex(rollNumber),
      at: Date.now(),
      game: currentGame,
    })

    const roundResult = await runSingleBetRound(betSizeUsdThisRound, roundOpts, currentGame)
    if (!roundResult) {
      rollNumber--
      continue
    }
    if (roundResult.cancelled) break

    const {
      payout,
      betIid,
      wageredUsdThisRound,
      payoutUsd,
      placedAmountMajor,
      multi,
      win,
      betApi,
      kenoPicks,
      kenoDrawn,
      kenoHits,
      diceTarget,
      diceResult,
      limboTarget,
      limboResult,
      minesCount,
      diamondsCount,
      minesSelected,
      minesLocations,
      hiloCards,
      hiloRank,
      hiloSuit,
    } = roundResult
    if (kenoHeatmapCycleRuntime && currentGame === 'keno') {
      tickKenoHeatmapCycle(kenoHeatmapCycleRuntime, kenoDrawn, callbacks.onLog)
    }
    houseBetBridge.linkBetApiId(toBetListIndex(rollNumber), betApi?.id ?? betApi?.betApiId ?? betIid)
    totalWageredUsd += wageredUsdThisRound
    const roundProfitUsd = payoutUsd - wageredUsdThisRound
    profitUsd += roundProfitUsd
    peakProfitUsd = Math.max(peakProfitUsd, profitUsd)
    lastMultiForStop = multi

    if (workbenchEnabled && comboEngine) {
      const { stopSession, enteredCombo } = advanceComboAfterRound(workbenchOptions, comboEngine, win)
      if (enteredCombo && win && payoutUsd > 0 && (workbenchOptions.comboParts?.length ?? 0) > 0) {
        const parts = (workbenchOptions.comboParts ?? []).map((p, i) => ({
          ...p,
          betSize: i === 0 ? payoutUsd : p.betSize,
        }))
        workbenchOptions = { ...workbenchOptions, comboParts: parts }
        options._workbenchOptions = workbenchOptions
      }
      if (stopSession) {
        callbacks.onLog?.('Combo complete — stop on combo hit')
        break
      }
    }

    if (workbenchEnabled && b2bRuntime && win) {
      const b2bOn =
        isB2bOnWin(currentOpts, workbenchOptions) || workbenchOptions.targetSelectionMode === 'combo'
      const prod = recordB2bWin(b2bRuntime, multi, b2bOn)
      maxB2bMulti = Math.max(maxB2bMulti, prod)
    } else if (workbenchEnabled && b2bRuntime && !win) {
      recordB2bLoss(b2bRuntime)
    }

    const isB2bMode = isB2bOnWin(currentOpts, workbenchEnabled ? workbenchOptions : undefined)
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

    const b2bTpCfg = readB2bTakeProfitOpts(
      currentOpts,
      workbenchEnabled ? workbenchOptions : undefined
    )
    const hasB2bTakeProfitRules =
      b2bTpCfg.afterWins > 0 ||
      b2bTpCfg.atChainMultiplier > 0 ||
      b2bTpCfg.chainProfitPct > 0 ||
      b2bTpCfg.chainProfitUsd > 0

    let tookB2bProfit = false
    if (win) {
      wins++
      currentStreak = lastWin ? currentStreak + 1 : 1

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
              const rotated = await rotateSeed()
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
            readB2bSmartTpOpts(currentOpts, workbenchEnabled ? workbenchOptions : undefined)
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
        await rotateSeed()
      } catch {
        /* no routine log spam */
      }
    }

    if (mode === 'wager' && !win && resetSeedOnLoss) {
      try {
        const rotated = await rotateSeed()
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
          const rotated = await rotateSeed()
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

    if (mode === 'wager' && currentGame === 'dice') {
      rollsSinceSwitch++
      if (win) winsSinceSwitch++
      else lossesSinceSwitch++
      let shouldSwitch = false
      if (optBoolFrom(currentOpts, 'isSwitchOverUnderAfterRolls', false)) {
        const n = optFrom(currentOpts, 'switchOverUnderAfterRolls', 0)
        if (n > 0 && rollsSinceSwitch >= n) shouldSwitch = true
      }
      if (optBoolFrom(currentOpts, 'isSwitchOverUnderAfterWins', false) && win) {
        const n = optFrom(currentOpts, 'switchOverUnderAfterWins', 0)
        if (n > 0 && winsSinceSwitch >= n) shouldSwitch = true
      }
      if (optBoolFrom(currentOpts, 'isSwitchOverUnderAfterLosses', false) && !win) {
        const n = optFrom(currentOpts, 'switchOverUnderAfterLosses', 0)
        if (n > 0 && lossesSinceSwitch >= n) shouldSwitch = true
      }
      if (optBoolFrom(currentOpts, 'isSwitchOverUnderAfterWinStreak', false) && win && currentStreak > 0) {
        const n = optFrom(currentOpts, 'switchOverUnderAfterWinStreak', 0)
        if (n > 0 && currentStreak >= n) shouldSwitch = true
      }
      if (optBoolFrom(currentOpts, 'isSwitchOverUnderAfterLossStreak', false) && !win && currentStreak < 0) {
        const n = optFrom(currentOpts, 'switchOverUnderAfterLossStreak', 0)
        if (n > 0 && -currentStreak >= n) shouldSwitch = true
      }
      if (shouldSwitch) {
        const over = optBoolFrom(currentOpts, 'rollOver', false)
        currentOpts = { ...currentOpts, rollOver: !over, betHigh: !over }
        workbenchOptions = { ...workbenchOptions, rollOver: !over, betHigh: !over }
        rollsSinceSwitch = 0
        winsSinceSwitch = 0
        lossesSinceSwitch = 0
        callbacks.onLog?.(`Switched to roll ${!over ? 'over' : 'under'}`)
      }
    }

    if (mode === 'wager') {
      if (win) {
        winsSinceSeedChange++
        lossesSinceSeedChange = 0
        if (optBoolFrom(currentOpts, 'isSeedChangeAfterWins', false)) {
          const n = optFrom(currentOpts, 'seedChangeAfterWins', 0)
          if (n > 0 && winsSinceSeedChange >= n) {
            try {
              await rotateSeed()
              winsSinceSeedChange = 0
              callbacks.onLog?.('Seed rotated after wins')
            } catch {
              /* ignore */
            }
          }
        }
        if (optBoolFrom(currentOpts, 'isSeedChangeAfterWinStreak', false) && currentStreak > 0) {
          const n = optFrom(currentOpts, 'seedChangeAfterWinStreak', 0)
          if (n > 0 && currentStreak >= n) {
            try {
              await rotateSeed()
              callbacks.onLog?.('Seed rotated after win streak')
            } catch {
              /* ignore */
            }
          }
        }
        if (optBoolFrom(currentOpts, 'isSeedChangeOnMultiplier', false)) {
          const n = optFrom(currentOpts, 'seedChangeOnMultiplier', 0)
          if (n > 0 && multi >= n) {
            try {
              await rotateSeed()
              callbacks.onLog?.(`Seed rotated on multiplier ≥ ${n}×`)
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        lossesSinceSeedChange++
        winsSinceSeedChange = 0
        if (optBoolFrom(currentOpts, 'isSeedChangeAfterLosses', false)) {
          const n = optFrom(currentOpts, 'seedChangeAfterLosses', 0)
          if (n > 0 && lossesSinceSeedChange >= n) {
            try {
              await rotateSeed()
              lossesSinceSeedChange = 0
              callbacks.onLog?.('Seed rotated after losses')
            } catch {
              /* ignore */
            }
          }
        }
        if (optBoolFrom(currentOpts, 'isSeedChangeAfterLossStreak', false) && currentStreak < 0) {
          const n = optFrom(currentOpts, 'seedChangeAfterLossStreak', 0)
          if (n > 0 && -currentStreak >= n) {
            try {
              await rotateSeed()
              callbacks.onLog?.('Seed rotated after loss streak')
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    if (mode === 'wager' && optBoolFrom(options, 'isVaultAllProfits', false) && !vaultDeposited) {
      const threshold = optFrom(options, 'vaultProfitsThreshold', 0)
      if (threshold > 0 && profitUsd >= threshold) {
        vaultDeposited = true
        callbacks.onLog?.(
          `Vault threshold reached: profit $${profitUsd.toFixed(4)} ≥ $${threshold} (vault deposit API not available — logged only)`
        )
      }
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

    const betShareId = houseBetBridge.getShareId(toBetListIndex(rollNumber))
    lastBetIdStr = betShareId ?? betIid ?? ''
    if (workbenchEnabled && workbenchOptions.sendBetIdToChallengesRoom && betShareId) {
      callbacks.onLog?.(`[Challenges] Bet ID: ${betShareId}`)
    }
    callbacks.onBetPlaced?.({
      iid: betIid,
      betId: betShareId,
      payout,
      amount: placedAmountMajor,
      game: currentGame,
      betIndex: toBetListIndex(rollNumber),
      betSizeUsd: wageredUsdThisRound,
      payoutUsd,
      roundProfitUsd,
      profitUsd,
      multi,
      b2bMulti,
      timestamp: Date.now(),
      nonce: String(rollNumber),
      win,
      kenoPicks,
      kenoDrawn,
      kenoHits,
      diceTarget,
      diceResult,
      limboTarget,
      limboResult,
      minesCount,
      diamondsCount,
      minesSelected,
      minesLocations,
      hiloCards,
      hiloRank,
      hiloSuit,
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
      currentB2bStreak: isB2bMode || workbenchOptions.targetSelectionMode === 'combo' ? b2bChainWins : 0,
      sessionElapsedMs,
      betsPerSec,
      b2bSecuredUsd,
      rtp: totalWageredUsd > 0 ? (totalWageredUsd + profitUsd) / totalWageredUsd : 0,
    })

    const deferStopForNextWin = (reason: string | null | undefined): boolean => {
      if (!reason) return false
      if ((workbenchOptions.stopOnNextWin || signal.stopOnNextWin) && !win) {
        stopOnNextWinPending = true
        callbacks.onLog?.(`Armed: ${reason} — waiting for next win`)
        return false
      }
      callbacks.onLog?.(`Stop: ${reason}`)
      return true
    }

    if (stopOnProfit > 0 && profitUsd >= stopOnProfit) {
      if (deferStopForNextWin(`Profit $${profitUsd.toFixed(4)}`)) break
    } else if (stopOnLoss > 0 && profitUsd <= -stopOnLoss) {
      if (deferStopForNextWin(`Loss $${Math.abs(profitUsd).toFixed(4)}`)) break
    } else if (stopOnTotalWagered > 0 && totalWageredUsd >= stopOnTotalWagered) {
      if (deferStopForNextWin(`Wagered $${totalWageredUsd.toFixed(2)}`)) break
    } else if (stopOnWinStreak > 0 && currentStreak >= stopOnWinStreak) {
      if (deferStopForNextWin(`Win streak ${currentStreak}`)) break
    } else if (stopOnLossStreak > 0 && -currentStreak >= stopOnLossStreak) {
      if (deferStopForNextWin(`Loss streak ${-currentStreak}`)) break
    } else if (
      stopOnB2bStreak > 0 &&
      isB2bOnWin(currentOpts, workbenchEnabled ? workbenchOptions : undefined) &&
      b2bChainWins >= stopOnB2bStreak
    ) {
      if (deferStopForNextWin(`B2B streak ${b2bChainWins}`)) break
    } else if (workbenchEnabled) {
      if (huntPacksCards) {
        const collected = packsCollectedFromBetApi(betApi)
        const newIds = packsNewCardIdsFromBetApi(betApi)
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
            callbacks.onLog?.('Stop: packs collection complete')
            break
          }
        }
      }
      const stopReason = checkWorkbenchStops(workbenchOptions, {
        profitUsd,
        peakProfitUsd,
        totalWageredUsd,
        lastMulti: lastMultiForStop,
        lastBetId: lastBetIdStr,
        lastWin: win,
        rollNumber,
        b2bProduct: isB2bOnWin(currentOpts, workbenchOptions) ? b2bChainMultiProduct : (b2bRuntime?.runningProduct ?? 0),
        b2bStreak: isB2bOnWin(currentOpts, workbenchOptions) ? b2bChainWins : 0,
      })
      if (deferStopForNextWin(stopReason ?? null)) break
    }

    if ((stopOnNextWinPending || signal.stopOnNextWin) && win) {
      callbacks.onLog?.('Stop: next win')
      break
    }

    const delayMs = getRequestDelayMs()
    if (delayMs > 0 && !signal.cancelled) {
      await sleep(delayMs)
      if (await waitWhilePaused(signal)) break
    }
  }
  } finally {
    houseBetBridge.dispose()
  }
}
