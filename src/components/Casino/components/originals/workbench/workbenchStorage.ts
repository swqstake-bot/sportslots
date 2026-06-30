import type { OriginalsBettingMode } from '../schema/workbenchOptions'
import { DEFAULT_ORIGINALS_GAME } from '../registry/originalsRegistry'
import {
  DEFAULT_TURBO_FIRE_INTERVAL_MS,
  DEFAULT_TURBO_MAX_IN_FLIGHT,
  normalizeTurboSettings,
} from '../engine/turboConfig'

const KEY_GAME = 'originalsWorkbenchGame'
const KEY_MODE = 'originalsWorkbenchMode'
const KEY_STATS_OPEN = 'originalsWorkbenchStatsOpen'
const KEY_SETTINGS = 'originalsWorkbenchSettings'

export type BetListColumnId =
  | 'game'
  | 'betId'
  | 'bet'
  | 'multi'
  | 'b2b'
  | 'pl'
  | 'time'
  | 'nonce'
  | 'kenoPicks'
  | 'kenoDrawn'
  | 'kenoHits'

export type BetListColumns = Record<BetListColumnId, boolean>

export const DEFAULT_BET_LIST_COLUMNS: BetListColumns = {
  game: true,
  betId: true,
  bet: true,
  multi: true,
  b2b: true,
  pl: true,
  time: false,
  nonce: false,
  kenoPicks: false,
  kenoDrawn: false,
  kenoHits: false,
}

/** Keno defaults: show picked/drawn numbers in bet list (Antebot-style). */
export const DEFAULT_KENO_BET_LIST_COLUMNS: BetListColumns = {
  ...DEFAULT_BET_LIST_COLUMNS,
  kenoPicks: true,
  kenoDrawn: true,
  kenoHits: true,
}

export type WorkbenchSettings = {
  currency: string
  requestInterval: number
  /** @deprecated Use turboMode — kept for saved settings migration */
  requestIntervalAsyncMode: number
  /** @deprecated Use turboMode */
  asyncMode: boolean
  turboMode: boolean
  turboFireIntervalMs: number
  turboMaxInFlight: number
  clientSeed: string
  maxFiatBetSize: number
  soundOnWin: boolean
  soundOnLoss: boolean
  forceRestartBetting: boolean
  /** Delay in seconds before auto-restart after session ends. Default 15. */
  forceRestartDelaySeconds: number
  /** How many ms to add to requestInterval on each 429. Default 25. */
  requestIntervalRateLimitIncrement: number
  sidebarWidth: number
  showBetList: boolean
  showStatsPanel: boolean
  statsFloating: boolean
  betListMaxEntries: number
  /** Global bet list columns (fallback when no per-game entry). */
  betListColumns: BetListColumns
  /** Per-game column overrides, keyed by game slug. */
  betListColumnsByGame: Record<string, BetListColumns>
}

const DEFAULT_SETTINGS: WorkbenchSettings = {
  currency: 'usdc',
  requestInterval: 0,
  requestIntervalAsyncMode: 0,
  asyncMode: false,
  turboMode: false,
  turboFireIntervalMs: DEFAULT_TURBO_FIRE_INTERVAL_MS,
  turboMaxInFlight: DEFAULT_TURBO_MAX_IN_FLIGHT,
  clientSeed: '',
  maxFiatBetSize: 0,
  soundOnWin: false,
  soundOnLoss: false,
  forceRestartBetting: false,
  forceRestartDelaySeconds: 15,
  requestIntervalRateLimitIncrement: 25,
  sidebarWidth: 380,
  showBetList: true,
  showStatsPanel: true,
  statsFloating: false,
  betListMaxEntries: 250,
  betListColumns: { ...DEFAULT_BET_LIST_COLUMNS },
  betListColumnsByGame: {},
}

function migrateSettings(raw: Partial<WorkbenchSettings>): WorkbenchSettings {
  const merged: WorkbenchSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    betListColumns: { ...DEFAULT_BET_LIST_COLUMNS, ...raw.betListColumns },
    betListColumnsByGame: raw.betListColumnsByGame ?? {},
  }
  if (merged.asyncMode && !raw.turboMode) {
    merged.turboMode = true
    if (merged.turboFireIntervalMs === 0 && merged.requestIntervalAsyncMode > 0) {
      merged.turboFireIntervalMs = merged.requestIntervalAsyncMode
    }
  }
  if (merged.turboFireIntervalMs === 0) {
    merged.turboFireIntervalMs = DEFAULT_TURBO_FIRE_INTERVAL_MS
  }
  if (!merged.forceRestartDelaySeconds || merged.forceRestartDelaySeconds <= 0) {
    merged.forceRestartDelaySeconds = DEFAULT_SETTINGS.forceRestartDelaySeconds
  }
  if (!merged.requestIntervalRateLimitIncrement || merged.requestIntervalRateLimitIncrement < 0) {
    merged.requestIntervalRateLimitIncrement = DEFAULT_SETTINGS.requestIntervalRateLimitIncrement
  }
  const normalized = normalizeTurboSettings({
    fireIntervalMs: merged.turboFireIntervalMs,
    maxInFlight: merged.turboMaxInFlight,
  })
  merged.turboFireIntervalMs = normalized.fireIntervalMs
  merged.turboMaxInFlight = normalized.maxInFlight
  if (merged.sidebarWidth > 0 && merged.sidebarWidth < 340) {
    merged.sidebarWidth = DEFAULT_SETTINGS.sidebarWidth
  }
  return merged
}

const KENO_BET_LIST_COLUMN_KEYS: BetListColumnId[] = ['kenoPicks', 'kenoDrawn', 'kenoHits']

/** Returns per-game columns if set, otherwise global columns. Keno shows number columns by default. */
export function getBetListColumns(settings: WorkbenchSettings, gameSlug: string): BetListColumns {
  const slug = gameSlug.toLowerCase()
  const defaults = slug === 'keno' ? DEFAULT_KENO_BET_LIST_COLUMNS : DEFAULT_BET_LIST_COLUMNS
  const perGame = settings.betListColumnsByGame?.[slug]
  const merged: BetListColumns = {
    ...defaults,
    ...settings.betListColumns,
    ...(perGame ?? {}),
  }
  // Global betListColumns (all false) must not hide Keno picks/drawn/hits — Antebot-style defaults for Keno.
  if (slug === 'keno') {
    for (const key of KENO_BET_LIST_COLUMN_KEYS) {
      merged[key] = perGame?.[key] ?? DEFAULT_KENO_BET_LIST_COLUMNS[key]
    }
  }
  return merged
}

/** Save per-game column preferences and persist to localStorage. */
export function saveBetListColumnsForGame(
  settings: WorkbenchSettings,
  gameSlug: string,
  columns: BetListColumns
): WorkbenchSettings {
  const next: WorkbenchSettings = {
    ...settings,
    betListColumnsByGame: {
      ...settings.betListColumnsByGame,
      [gameSlug.toLowerCase()]: columns,
    },
  }
  saveWorkbenchSettings(next)
  return next
}

export function loadSelectedGame(): string {
  try {
    const v = localStorage.getItem(KEY_GAME)
    if (v) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_ORIGINALS_GAME
}

export function saveSelectedGame(slug: string): void {
  try {
    localStorage.setItem(KEY_GAME, slug)
  } catch {
    /* ignore */
  }
}

export function loadBettingMode(): OriginalsBettingMode {
  try {
    const v = localStorage.getItem(KEY_MODE) as OriginalsBettingMode | null
    if (v === 'manual' || v === 'automatic' || v === 'conditions' || v === 'code' || v === 'dice-runner') {
      return v
    }
  } catch {
    /* ignore */
  }
  return 'automatic'
}

export function saveBettingMode(mode: OriginalsBettingMode): void {
  try {
    localStorage.setItem(KEY_MODE, mode)
  } catch {
    /* ignore */
  }
}

export function loadStatsDrawerOpen(): boolean {
  try {
    const v = localStorage.getItem(KEY_STATS_OPEN)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

export function saveStatsDrawerOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY_STATS_OPEN, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadWorkbenchSettings(): WorkbenchSettings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS)
    if (!raw) return { ...DEFAULT_SETTINGS, betListColumns: { ...DEFAULT_BET_LIST_COLUMNS }, betListColumnsByGame: {} }
    return migrateSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS, betListColumns: { ...DEFAULT_BET_LIST_COLUMNS }, betListColumnsByGame: {} }
  }
}

export function saveWorkbenchSettings(settings: WorkbenchSettings): void {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function loadProfilesOnStart(): boolean {
  try {
    return localStorage.getItem('originalsLoadProfileOnStart') !== '0'
  } catch {
    return true
  }
}
