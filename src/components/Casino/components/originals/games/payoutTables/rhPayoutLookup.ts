import tablesData from './rh-payout-tables.json'

export type RhPayoutOption = {
  label: string
  multi: number
  diamonds?: number
  mines?: number
  bars?: number
  stage?: number
  round?: number
}

export type RhPayoutVariant = {
  id: string
  label: string
  setup?: string
  mines?: number
  options: RhPayoutOption[]
}

export type RhPayoutGame = {
  type: 'variants' | 'levels'
  variants?: RhPayoutVariant[]
  options?: RhPayoutOption[]
}

type RhTables = { version: number; games: Record<string, RhPayoutGame> }

const TABLES = tablesData as RhTables

/** Workbench slug → modhub RH game name */
export const SLUG_TO_RH_GAME: Record<string, string> = {
  mines: 'Mines',
  bars: 'Bars',
  'dragon-tower': 'Dragon Tower',
  chicken: 'Chicken',
  pump: 'Pump',
  tarot: 'Tarot',
  'rock-paper-scissors': 'Rock Paper Scissors',
}

export function rhGameForSlug(slug: string): string | null {
  return SLUG_TO_RH_GAME[slug.toLowerCase()] ?? null
}

export function hasRhPayoutTable(slug: string): boolean {
  const name = rhGameForSlug(slug)
  return Boolean(name && TABLES.games[name])
}

function gameTable(name: string): RhPayoutGame | null {
  return TABLES.games[name] ?? null
}

function variantById(table: RhPayoutGame, variantId: string): RhPayoutVariant | null {
  if (table.type !== 'variants') return null
  return table.variants?.find((v) => v.id === variantId) ?? null
}

export function minesPayoutMulti(mines: number, diamonds: number): number | null {
  const variant = variantById(gameTable('Mines')!, String(mines))
  return variant?.options.find((o) => o.diamonds === diamonds)?.multi ?? null
}

export function listMinesPayoutOptions(mines: number): RhPayoutOption[] {
  return variantById(gameTable('Mines')!, String(mines))?.options ?? []
}

export function maxMinesDiamonds(mines: number): number {
  return Math.max(1, 25 - mines)
}

export function barsPayoutMulti(difficulty: string, barCount: number): number | null {
  const variant = variantById(gameTable('Bars')!, difficulty.toLowerCase())
  return variant?.options.find((o) => o.bars === barCount)?.multi ?? null
}

export function listBarsPayoutOptions(difficulty: string): RhPayoutOption[] {
  return variantById(gameTable('Bars')!, difficulty.toLowerCase())?.options ?? []
}

export function dragonTowerPayoutMulti(difficulty: string, stage: number): number | null {
  const variant = variantById(gameTable('Dragon Tower')!, difficulty.toLowerCase())
  return variant?.options.find((o) => o.stage === stage)?.multi ?? null
}

export function chickenPayoutMulti(difficulty: string, stage: number): number | null {
  const variant = variantById(gameTable('Chicken')!, difficulty.toLowerCase())
  return variant?.options.find((o) => o.stage === stage)?.multi ?? null
}

export function pumpPayoutMulti(level: number): number | null {
  const opts = gameTable('Pump')?.options ?? []
  return opts[level - 1]?.multi ?? null
}

export function rpsPayoutMulti(round: number): number | null {
  const opts = gameTable('Rock Paper Scissors')?.options ?? []
  return opts.find((o) => o.round === round)?.multi ?? null
}

export function tarotPayoutOptions(): RhPayoutOption[] {
  return gameTable('Tarot')?.options ?? []
}

export function listVariantPayoutOptions(gameName: string, variantId: string): RhPayoutOption[] {
  const table = gameTable(gameName)
  if (!table) return []
  if (table.type === 'levels') return table.options ?? []
  return variantById(table, variantId)?.options ?? []
}
