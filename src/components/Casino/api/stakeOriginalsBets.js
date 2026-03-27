/**
 * Stake Originals – Platzieren von Wetten (Dice, Limbo, Mines, Plinko, Keno, Packs).
 * Komplett unabhängig von Slots / RGS. Nutzt Stake GraphQL; Mutations-Namen/Schema
 * ggf. aus Stake Network-Tab beim Platzieren einer Wette ermitteln.
 *
 * FRIDA BetData: diceRoll, limboBet, minesBet, plinkoBet, kenoBet; Packs (UI) = GraphQL casesBet.
 */

import { StakeApi } from '../../../api/client'

// --- Mutation-Strings (Schema anhand Stake DevTools/Network anpassen) ---

/** Dice: condition = ROLL_UNDER | ROLL_OVER, target = Schwellwert (z.B. 49.5). */
const DICE_ROLL_MUTATION = `mutation DiceRoll($amount: Float!, $currency: CurrencyEnum!, $condition: CasinoGameDiceConditionEnum!, $target: Float!) {
  diceRoll(amount: $amount, currency: $currency, condition: $condition, target: $target) {
    id
    state { __typename }
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Limbo: multiplierTarget = Ziel-Multiplikator (z.B. 2.0). */
const LIMBO_BET_MUTATION = `mutation LimboBet($amount: Float!, $currency: CurrencyEnum!, $multiplierTarget: Float!) {
  limboBet(amount: $amount, currency: $currency, multiplierTarget: $multiplierTarget) {
    id
    state { __typename }
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Mines: minesCount = Anzahl Minen (z.B. 3). Start einer Runde; identifier aus Response für Reveal/Cashout. */
const MINES_BET_MUTATION = `mutation MinesBet($amount: Float!, $currency: CurrencyEnum!, $minesCount: Int!) {
  minesBet(amount: $amount, currency: $currency, minesCount: $minesCount) {
    id
    state { __typename }
    active
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Mines: Feld(er) aufdecken (0–24). Stake-Mutation heißt minesNext. */
const MINES_NEXT_MUTATION = `mutation MinesNext($identifier: String!, $fields: [Int!]!) {
  minesNext(identifier: $identifier, fields: $fields) {
    id
    state { __typename }
    active
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Mines: Runde beenden und auszahlen. */
const MINES_CASHOUT_MUTATION = `mutation MinesCashout($identifier: String!) {
  minesCashout(identifier: $identifier) {
    id
    state { __typename }
    active
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Plinko: rows + risk = CasinoGamePlinkoRiskEnum (LOW, MEDIUM, HIGH). */
const PLINKO_BET_MUTATION = `mutation PlinkoBet($amount: Float!, $currency: CurrencyEnum!, $rows: Int!, $risk: CasinoGamePlinkoRiskEnum!) {
  plinkoBet(amount: $amount, currency: $currency, rows: $rows, risk: $risk) {
    id
    state { __typename }
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Keno: numbers = [1–40], risk = CasinoGameKenoRiskEnum. */
const KENO_BET_MUTATION = `mutation KenoBet($amount: Float!, $currency: CurrencyEnum!, $numbers: [Int!]!, $risk: CasinoGameKenoRiskEnum!) {
  kenoBet(amount: $amount, currency: $currency, numbers: $numbers, risk: $risk) {
    id
    state { __typename }
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Map UI → CasesDifficultyEnum (Network-Tab bei Bedarf prüfen). */
function toCasesDifficultyEnum(difficulty) {
  const d = String(difficulty || 'medium').toLowerCase()
  if (d === 'easy' || d === 'medium' || d === 'hard' || d === 'expert') return d
  return 'medium'
}

/** Packs (Stake UI „Packs“) = Mutation casesBet; state nur über Fragment CasinoGamePacks. */
const CASES_BET_MUTATION = `mutation CasesBet($amount: Float!, $currency: CurrencyEnum!, $identifier: String!, $difficulty: CasesDifficultyEnum!) {
  casesBet(amount: $amount, currency: $currency, identifier: $identifier, difficulty: $difficulty) {
    id
    active
    currency
    amount
    payout
    payoutMultiplier
    amountMultiplier
    updatedAt
    game
    state {
      __typename
      ... on CasinoGamePacks {
        cards {
          id
          isNew
          multiplier
        }
        cardsCollected
      }
    }
  }
}`

/**
 * Dice-Wette platzieren.
 * @param {Object} params
 * @param {number} params.amount - Einsatz
 * @param {string} params.currency - 'btc', 'usdc', 'eur'
 * @param {number} params.rollUnder - 0.01–99.99 (Schwellwert bei Roll Under)
 * @param {boolean} [params.rollOver] - true = Roll Over (Ziel = 100 - rollUnder)
 */
export async function placeDiceBet({ amount, currency, rollUnder, rollOver = false }) {
  const target = Number(rollUnder)
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    condition: rollOver ? 'above' : 'below',
    target: rollOver ? 100 - target : target,
  }
  const res = await StakeApi.mutate(DICE_ROLL_MUTATION, variables)
  const bet = res?.data?.diceRoll
  return bet ? { ...bet, iid: bet.id } : null
}

/**
 * Limbo-Wette platzieren.
 * @param {number} amount - Einsatz
 * @param {string} currency - Währung
 * @param {number} targetMultiplier - Ziel-Multiplikator (multiplierTarget)
 */
export async function placeLimboBet({ amount, currency, targetMultiplier }) {
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    multiplierTarget: Number(targetMultiplier),
  }
  const res = await StakeApi.mutate(LIMBO_BET_MUTATION, variables)
  const bet = res?.data?.limboBet
  return bet ? { ...bet, iid: bet.id } : null
}

/**
 * Mines: Runde starten (ein Call).
 * @returns Bet mit id (identifier für Reveal/Cashout)
 */
export async function placeMinesBet({ amount, currency, mineCount }) {
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    minesCount: Math.min(24, Math.max(1, Number(mineCount))),
  }
  const res = await StakeApi.mutate(MINES_BET_MUTATION, variables)
  const bet = res?.data?.minesBet
  return bet ? { ...bet, iid: bet.id } : null
}

/**
 * Mines: Feld(er) aufdecken (extra Call). Mutation = minesNext. fields = Indizes 0–24.
 * @param {string} identifier - id aus placeMinesBet-Response
 * @param {number[]} fields - z.B. [8] oder [13] (ein Feld) oder [1, 5, 9]
 */
export async function minesReveal({ identifier, fields }) {
  const vars = {
    identifier: String(identifier),
    fields: Array.isArray(fields) ? fields.map((n) => Math.max(0, Math.min(24, Number(n)))) : [],
  }
  if (vars.fields.length === 0) return null
  const res = await StakeApi.mutate(MINES_NEXT_MUTATION, vars)
  return res?.data?.minesNext ?? null
}

/**
 * Mines: Cashout (extra Call) – Runde beenden und auszahlen.
 * @param {string} identifier - id aus placeMinesBet-Response
 */
export async function minesCashout({ identifier }) {
  const res = await StakeApi.mutate(MINES_CASHOUT_MUTATION, { identifier: String(identifier) })
  return res?.data?.minesCashout ?? null
}

/** Map UI risk zu CasinoGamePlinkoRiskEnum (lowercase: low, medium, high). */
function toPlinkoRiskEnum(risk) {
  const r = (risk || 'low').toLowerCase()
  if (r === 'medium') return 'medium'
  if (r === 'high') return 'high'
  return 'low'
}

/**
 * Plinko-Wette platzieren.
 * @param {number} amount - Einsatz
 * @param {string} currency - Währung
 * @param {number} rows - Reihen (8–16)
 * @param {string} risk - 'low' | 'medium' | 'high'
 */
export async function placePlinkoBet({ amount, currency, rows, risk }) {
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    rows: Number(rows) || 16,
    risk: toPlinkoRiskEnum(risk),
  }
  const res = await StakeApi.mutate(PLINKO_BET_MUTATION, variables)
  const bet = res?.data?.plinkoBet
  return bet ? { ...bet, iid: bet.id } : null
}

/** Map UI risk zu CasinoGameKenoRiskEnum (lowercase: low, medium, high). */
function toKenoRiskEnum(risk) {
  const r = (risk || 'low').toLowerCase()
  if (r === 'medium') return 'medium'
  if (r === 'high' || r === 'extreme') return 'high'
  return 'low'
}

/**
 * Keno-Wette platzieren.
 * @param {number} amount - Einsatz
 * @param {string} currency - Währung
 * @param {number[]} picks - Gewählte Zahlen (1–39, Stake max 39)
 * @param {string} risk - 'low' | 'medium' | 'high' | 'extreme'
 */
export async function placeKenoBet({ amount, currency, picks, risk }) {
  const numbers = Array.isArray(picks) ? picks.map(Number).filter((n) => n >= 1 && n <= 39).slice(0, 10) : []
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    numbers,
    risk: toKenoRiskEnum(risk),
  }
  const res = await StakeApi.mutate(KENO_BET_MUTATION, variables)
  const bet = res?.data?.kenoBet
  return bet ? { ...bet, iid: bet.id } : null
}

/**
 * Packs (Stake Original) – GraphQL casesBet (slug „packs“ im Kurator).
 * @param {number} amount – Einsatz in Währungseinheiten (Float)
 * @param {string} currency – z. B. usdt
 * @param {string} identifier – aus casesBet-Variables im Network (Session/Kette)
 * @param {string} [difficulty] – easy | medium | hard | expert
 */
export async function placePacksBet({ amount, currency, identifier, difficulty }) {
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    identifier: String(identifier || '').trim(),
    difficulty: toCasesDifficultyEnum(difficulty),
  }
  if (!variables.identifier) return null
  const res = await StakeApi.mutate(CASES_BET_MUTATION, variables)
  const bet = res?.data?.casesBet
  return bet ? { ...bet, iid: bet.id } : null
}

/** Rotate seed pair (neuer Client-Seed auf Stake). Bei „Seed nach X Rolls“ vor jedem neuen Block aufrufen. */
const ROTATE_SEED_PAIR_MUTATION = `mutation RotateSeedPair($seed: String!) {
  rotateSeedPair(seed: $seed) {
    clientSeed {
      user {
        id
        activeClientSeed { id seed __typename }
        activeServerSeed { id nonce seedHash nextSeedHash __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}`

function randomClientSeed() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  if (Math.random() > 0.5) s += '-' + chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * Rotiert das Seed-Paar auf Stake (neuer Client-Seed). Für Script-Mode „Seed nach X Rolls“.
 * @param {string} [seed] - Optional; wenn nicht gesetzt, wird ein zufälliger Seed erzeugt.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function rotateSeedPair(seed) {
  const variables = { seed: seed || randomClientSeed() }
  const res = await StakeApi.mutate(ROTATE_SEED_PAIR_MUTATION, variables)
  return { ok: !!res?.data?.rotateSeedPair }
}

const BJ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
function randomBlackjackIdentifier() {
  let s = ''
  for (let i = 0; i < 21; i++) s += BJ_CHARS[Math.floor(Math.random() * BJ_CHARS.length)]
  return s
}

/**
 * Stake Originals Blackjack – REST `/_api/casino/blackjack/bet` (Session wie GraphQL).
 * @returns Roh-JSON mit `blackjackBet`
 */
export async function stakeBlackjackBet({ amount, currency, identifier }) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.invoke) throw new Error('Electron API nicht verfügbar (stake-casino-rest-post).')
  const id = identifier != null && String(identifier).trim() ? String(identifier).trim() : randomBlackjackIdentifier()
  return api.invoke('stake-casino-rest-post', {
    path: '/_api/casino/blackjack/bet',
    body: {
      identifier: id,
      amount: Number(amount),
      currency: String(currency || 'usdc').toLowerCase(),
    },
  })
}

/**
 * @param {string} action – hit | stand | double | split | insurance | noInsurance (Insurance ablehnen)
 * @returns Roh-JSON mit `blackjackNext`
 */
export async function stakeBlackjackNext({ action, identifier }) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.invoke) throw new Error('Electron API nicht verfügbar (stake-casino-rest-post).')
  const id = identifier != null && String(identifier).trim() ? String(identifier).trim() : randomBlackjackIdentifier()
  return api.invoke('stake-casino-rest-post', {
    path: '/_api/casino/blackjack/next',
    body: { action: String(action), identifier: id },
  })
}
