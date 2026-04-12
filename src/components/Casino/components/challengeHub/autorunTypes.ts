export interface AutorunRule {
  id: string
  thresholdUsd: number
  slotSlug: string
  betUsd: number
  /** null = unlimited while this rule stays active */
  maxSpins: number | null
}

export interface AutorunGlobalStops {
  stopLossUsd: number | null
  takeProfitUsd: number | null
  maxTotalSpins: number | null
  maxRuntimeMinutes: number | null
  maxLosingStreak: number | null
}

export interface AutorunConfig {
  version: 1
  /** Wie oft Regeln, Slot-Session und Einsatz neu anhand der Balance geprüft werden (Spins laufen dazwischen durchgehend). */
  scanIntervalSec: number
  sourceCurrency: string
  targetCurrency: string
  rules: AutorunRule[]
  stops: AutorunGlobalStops
}

function newId() {
  return `ar_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** Demo / default config (slugs are placeholders — pick real slots from the catalog). */
export function createDefaultAutorunConfig(): AutorunConfig {
  return {
    version: 1,
    scanIntervalSec: 5,
    sourceCurrency: 'usdc',
    targetCurrency: 'eur',
    rules: [
      {
        id: newId(),
        thresholdUsd: 3,
        slotSlug: 'waylanders-forge',
        betUsd: 0.01,
        maxSpins: null,
      },
      {
        id: newId(),
        thresholdUsd: 10,
        slotSlug: 'sweet-bonanza',
        betUsd: 0.05,
        maxSpins: null,
      },
      {
        id: newId(),
        thresholdUsd: 25,
        slotSlug: 'gates-of-olympus',
        betUsd: 0.1,
        maxSpins: null,
      },
    ],
    stops: {
      stopLossUsd: 1,
      takeProfitUsd: 50,
      maxTotalSpins: null,
      maxRuntimeMinutes: null,
      maxLosingStreak: null,
    },
  }
}

export function createEmptyRule(): AutorunRule {
  return {
    id: newId(),
    thresholdUsd: 0,
    slotSlug: '',
    betUsd: 0.01,
    maxSpins: null,
  }
}

export function normalizeAutorunConfig(raw: unknown): AutorunConfig {
  const base = createDefaultAutorunConfig()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const stopsIn = (o.stops && typeof o.stops === 'object' ? o.stops : {}) as Record<string, unknown>
  const parseNum = (v: unknown, fallback: number | null) => {
    const n = Number(v)
    return v === null || v === '' || v === undefined ? fallback : Number.isFinite(n) ? n : fallback
  }
  const rulesIn = Array.isArray(o.rules) ? o.rules : []
  const rules: AutorunRule[] = rulesIn
    .map((r) => {
      if (!r || typeof r !== 'object') return null
      const x = r as Record<string, unknown>
      const maxSpinsRaw = x.maxSpins
      return {
        id: typeof x.id === 'string' && x.id ? x.id : newId(),
        thresholdUsd: Math.max(0, Number(x.thresholdUsd) || 0),
        slotSlug: String(x.slotSlug || '').toLowerCase().trim(),
        betUsd: Math.max(0, Number(x.betUsd) || 0.01),
        maxSpins:
          maxSpinsRaw === null || maxSpinsRaw === undefined || maxSpinsRaw === ''
            ? null
            : Math.max(0, Math.floor(Number(maxSpinsRaw))),
      } as AutorunRule
    })
    .filter(Boolean) as AutorunRule[]

  return {
    version: 1,
    scanIntervalSec: Math.min(120, Math.max(2, Math.floor(Number(o.scanIntervalSec) || base.scanIntervalSec))),
    sourceCurrency: String(o.sourceCurrency || base.sourceCurrency).toLowerCase(),
    targetCurrency: String(o.targetCurrency || base.targetCurrency).toLowerCase(),
    rules: rules.length ? rules : base.rules,
    stops: {
      stopLossUsd: parseNum(stopsIn.stopLossUsd, base.stops.stopLossUsd),
      takeProfitUsd: parseNum(stopsIn.takeProfitUsd, base.stops.takeProfitUsd),
      maxTotalSpins: parseNum(stopsIn.maxTotalSpins, base.stops.maxTotalSpins),
      maxRuntimeMinutes: parseNum(stopsIn.maxRuntimeMinutes, base.stops.maxRuntimeMinutes),
      maxLosingStreak: parseNum(stopsIn.maxLosingStreak, base.stops.maxLosingStreak),
    },
  }
}
