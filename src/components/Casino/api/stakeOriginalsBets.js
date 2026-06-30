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

/** Mines: minesCount = Anzahl Minen (z.B. 3). Optional fields[] = tiles to reveal in one bet. */
const MINES_BET_MUTATION = `mutation MinesBet($amount: Float!, $currency: CurrencyEnum!, $minesCount: Int!, $fields: [Int!], $identifier: String!) {
  minesBet(amount: $amount, currency: $currency, minesCount: $minesCount, fields: $fields, identifier: $identifier) {
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

/** Plinko: rows + risk = CasinoGamePlinkoRiskEnum (LOW, MEDIUM, HIGH, EXPERT). */
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
    state {
      ... on CasinoGameKeno {
        drawnNumbers
        selectedNumbers
      }
    }
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

/** GraphQL Originals: `id` ist interne CasinoBet-ID (betApiId), nicht houseBets-Share-`iid`. */
function normalizeGraphqlOriginalsBet(bet) {
  if (!bet) return null
  const apiId = bet.id != null ? String(bet.id) : undefined
  return { ...bet, betApiId: apiId }
}

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
  return normalizeGraphqlOriginalsBet(bet)
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
  return normalizeGraphqlOriginalsBet(bet)
}

/**
 * Mines: Runde starten. Mit fields[] werden Gems in einem Call aufgedeckt (Stake/SSP API).
 * @param {number[]} [fields] - Tile indices 0–24 (count = gems to reveal)
 * @returns Bet mit id (identifier für Reveal/Cashout wenn fields leer)
 */
export async function placeMinesBet({ amount, currency, mineCount, fields, identifier }) {
  const normalizedFields = Array.isArray(fields)
    ? fields.map((n) => Math.max(0, Math.min(24, Number(n)))).filter((n) => Number.isFinite(n))
    : []
  const variables = {
    amount: Number(amount),
    currency: (currency || 'usdc').toLowerCase(),
    minesCount: Math.min(24, Math.max(1, Number(mineCount))),
    fields: normalizedFields,
    identifier: identifier || randomRestIdentifier(),
  }
  const res = await StakeApi.mutate(MINES_BET_MUTATION, variables)
  const bet = res?.data?.minesBet
  return normalizeGraphqlOriginalsBet(bet)
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

/** Map UI risk zu CasinoGamePlinkoRiskEnum (lowercase: low, medium, high, expert). */
function toPlinkoRiskEnum(risk) {
  const r = (risk || 'low').toLowerCase()
  if (r === 'medium') return 'medium'
  if (r === 'high') return 'high'
  if (r === 'expert') return 'expert'
  return 'low'
}

/**
 * Plinko-Wette platzieren.
 * @param {number} amount - Einsatz
 * @param {string} currency - Währung
 * @param {number} rows - Reihen (8–16)
 * @param {string} risk - 'low' | 'medium' | 'high' | 'expert'
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
  return normalizeGraphqlOriginalsBet(bet)
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
  return normalizeGraphqlOriginalsBet(bet)
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
  return normalizeGraphqlOriginalsBet(bet)
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

const REST_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
function randomRestIdentifier(len = 21) {
  let s = ''
  for (let i = 0; i < len; i++) s += REST_ID_CHARS[Math.floor(Math.random() * REST_ID_CHARS.length)]
  return s
}

async function stakeCasinoRestPost(path, body) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.invoke) throw new Error('Electron API nicht verfügbar (stake-casino-rest-post).')
  return api.invoke('stake-casino-rest-post', { path, body })
}

function normalizeCasinoBetRow(row) {
  if (!row || typeof row !== 'object') return null
  const apiId = row.id != null ? String(row.id) : undefined
  return { ...row, betApiId: apiId ?? row.betApiId }
}

/** Snakes — REST `/_api/casino/snakes/bet` (SSP original-slot-bet). */
export async function placeSnakesBet({ amount, currency, difficulty = 'easy', rollCount = 1, identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/snakes/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: String(difficulty || 'easy').toLowerCase(),
    rollCount: Math.min(5, Math.max(1, Number(rollCount) || 1)),
    identifier: identifier || randomRestIdentifier(),
  })
  const bet = res?.snakesBet ?? res?.data?.snakesBet
  return normalizeCasinoBetRow(bet)
}

/** Wheel — REST `/_api/casino/wheel/spin`. */
export async function placeWheelBet({ amount, currency, segments = 10, risk = 'low', identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/wheel/spin', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    segments: Math.max(1, Number(segments) || 10),
    risk: String(risk || 'low').toLowerCase(),
    identifier: identifier || randomRestIdentifier(),
  })
  const bet = res?.wheelSpin ?? res?.wheelBet ?? res?.data?.wheelSpin
  return normalizeCasinoBetRow(bet)
}

const FLIP_BET_MUTATION = `mutation FlipBet($amount: Float!, $currency: CurrencyEnum!, $identifier: String, $guesses: [FlipConditionEnum!]!) {
  flipBet(amount: $amount, currency: $currency, identifier: $identifier, guesses: $guesses) {
    id
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Flip — GraphQL flipBet. */
export async function placeFlipBet({ amount, currency, guesses = ['heads'], identifier }) {
  const variables = {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    identifier: identifier || randomRestIdentifier(),
    guesses: Array.isArray(guesses) ? guesses : ['heads'],
  }
  const res = await StakeApi.mutate(FLIP_BET_MUTATION, variables)
  const bet = res?.data?.flipBet
  return normalizeCasinoBetRow(bet)
}

const PUMP_BET_MUTATION = `mutation PumpBet($amount: Float!, $currency: CurrencyEnum!, $identifier: String!, $round: Int!, $difficulty: CasinoGamePumpDifficultyEnum!) {
  pumpBet(amount: $amount, currency: $currency, identifier: $identifier, round: $round, difficulty: $difficulty) {
    id
    amount
    payout
    payoutMultiplier
    currency
    game
    updatedAt
  }
}`

/** Pump — GraphQL pumpBet. */
export async function placePumpBet({ amount, currency, round = 1, difficulty = 'easy', identifier }) {
  const variables = {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    identifier: identifier || randomRestIdentifier(),
    round: Math.max(1, Number(round) || 1),
    difficulty: String(difficulty || 'easy').toLowerCase(),
  }
  const res = await StakeApi.mutate(PUMP_BET_MUTATION, variables)
  const bet = res?.data?.pumpBet
  return normalizeCasinoBetRow(bet)
}

function pickRestBet(res, keys) {
  if (!res || typeof res !== 'object') return null
  for (const k of keys) {
    const row = res[k] ?? res?.data?.[k]
    const norm = normalizeCasinoBetRow(row)
    if (norm) return norm
  }
  return null
}

function toDifficultyEnum(difficulty) {
  const d = String(difficulty || 'medium').toLowerCase()
  if (d === 'easy' || d === 'medium' || d === 'hard' || d === 'expert' || d === 'master') return d
  return 'medium'
}

const DIAMONDS_BET_MUTATION = `mutation DiamondsBet($amount: Float!, $currency: CurrencyEnum!, $identifier: String!) {
  diamondsBet(amount: $amount, currency: $currency, identifier: $identifier) {
    id amount payout payoutMultiplier currency game updatedAt
  }
}`

export async function placeDiamondsBet({ amount, currency, identifier }) {
  const res = await StakeApi.mutate(DIAMONDS_BET_MUTATION, {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    identifier: identifier || randomRestIdentifier(),
  })
  return normalizeCasinoBetRow(res?.data?.diamondsBet)
}

const TOME_OF_LIFE_BET_MUTATION = `mutation TomeOfLifeBet($amount: Float!, $lines: Int!, $currency: CurrencyEnum!, $identifier: String!) {
  slotsTomeOfLifeBet(amount: $amount, currency: $currency, lines: $lines, identifier: $identifier) {
    id amount payout payoutMultiplier currency game updatedAt
  }
}`

export async function placeTomeOfLifeBet({ amount, currency, lines = 1, identifier }) {
  const res = await StakeApi.mutate(TOME_OF_LIFE_BET_MUTATION, {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    lines: Math.max(1, Math.min(20, Number(lines) || 1)),
    identifier: identifier || randomRestIdentifier(),
  })
  return normalizeCasinoBetRow(res?.data?.slotsTomeOfLifeBet)
}

const HILO_BET_MUTATION = `mutation HiloBet($amount: Float!, $currency: CurrencyEnum!, $startCard: HiloBetStartCardInput!) {
  hiloBet(amount: $amount, currency: $currency, startCard: $startCard) {
    id active amount payout payoutMultiplier currency game updatedAt
  }
}`

const HILO_NEXT_MUTATION = `mutation HiloNext($guess: CasinoGameHiloGuessEnum!) {
  hiloNext(guess: $guess) {
    id active amount payout payoutMultiplier currency game updatedAt
  }
}`

const HILO_CASHOUT_MUTATION = `mutation HiloCashout {
  hiloCashout {
    id active amount payout payoutMultiplier currency game updatedAt
  }
}`

const HILO_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const HILO_SUITS = ['C', 'D', 'H', 'S']

function resolveStartCard(startCard) {
  if (startCard && startCard.rank && startCard.suit) {
    return { rank: String(startCard.rank), suit: String(startCard.suit) }
  }
  return {
    rank: HILO_RANKS[Math.floor(Math.random() * HILO_RANKS.length)],
    suit: HILO_SUITS[Math.floor(Math.random() * HILO_SUITS.length)],
  }
}

function resolveSimpleHiloGuess(guess, rank) {
  const g = String(guess || 'higher').toLowerCase()
  if (g === 'higher') return rank === 'A' ? 'higher' : rank === 'K' ? 'equal' : 'higherEqual'
  if (g === 'lower') return rank === 'K' ? 'lower' : rank === 'A' ? 'equal' : 'lowerEqual'
  if (g === 'equal') return 'equal'
  return g
}

function parseHiloPattern(raw) {
  if (!raw || !String(raw).trim()) return []
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
}

function rankValue(rank) {
  const i = HILO_RANKS.indexOf(rank)
  return i >= 0 ? i : 0
}

function randomHiloGuess(rank) {
  if (rank === 'A') return Math.random() < 0.5 ? 'higher' : 'equal'
  if (rank === 'K') return Math.random() < 0.5 ? 'lower' : 'equal'
  return Math.random() < 0.5 ? 'lowerEqual' : 'higherEqual'
}

function guessFromHiloCode(code, rank) {
  switch (String(code).trim()) {
    case '0':
      if (rank === 'A') return 'equal'
      if (rank === 'K') return 'lower'
      return 'lowerEqual'
    case '1':
      if (rank === 'A') return 'higher'
      if (rank === 'K') return 'equal'
      return 'higherEqual'
    case '2':
      return 'equal'
    case '3':
      return randomHiloGuess(rank)
    case '4':
      return rankValue(rank) % 2 === 0 ? 'higherEqual' : 'lowerEqual'
    case '5':
      return rankValue(rank) % 2 === 0 ? 'lowerEqual' : 'higherEqual'
    case '7':
      return 'skip'
    default:
      return randomHiloGuess(rank)
  }
}

function cardRankFromBet(bet) {
  const rank = bet?.state?.startCard?.rank ?? bet?.state?.rank ?? bet?.startCard?.rank
  return rank ? String(rank) : '7'
}

/** Hilo — start, optional next rounds (pattern or single guess), cashout when still active. */
export async function placeHiloBet({ amount, currency, startCard, rounds = 1, guess = 'higher', pattern }) {
  const cur = String(currency || 'usdc').toLowerCase()
  const resolvedStart = resolveStartCard(startCard)
  const res = await StakeApi.mutate(HILO_BET_MUTATION, {
    amount: Number(amount),
    currency: cur,
    startCard: resolvedStart,
  })
  let bet = res?.data?.hiloBet
  if (!bet) return null

  const roundCount = Math.max(1, Number(rounds) || 1)
  const patternCodes = parseHiloPattern(pattern)
  let currentRank = cardRankFromBet(bet) || resolvedStart.rank

  for (let i = 0; i < roundCount - 1 && bet.active !== false; i++) {
    let guessVal
    if (patternCodes.length > 0) {
      guessVal = guessFromHiloCode(patternCodes[i % patternCodes.length], currentRank)
    } else {
      guessVal = resolveSimpleHiloGuess(guess, currentRank)
    }
    if (guessVal === 'skip') continue
    const nextRes = await StakeApi.mutate(HILO_NEXT_MUTATION, { guess: guessVal })
    const next = nextRes?.data?.hiloNext
    if (!next) break
    bet = next
    currentRank = cardRankFromBet(bet) || currentRank
    if (bet.active === false) break
  }

  if (bet.active !== false) {
    const cashRes = await StakeApi.mutate(HILO_CASHOUT_MUTATION, {})
    bet = cashRes?.data?.hiloCashout || bet
  }
  return normalizeCasinoBetRow(bet)
}

export async function placeDragonTowerBet({ amount, currency, difficulty = 'easy', eggs = [], identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/dragon-tower/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: toDifficultyEnum(difficulty),
    eggs: Array.isArray(eggs) ? eggs.filter((n) => n != null).map(Number) : [],
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['dragonTowerBet'])
}

export async function placeDartsBet({ amount, currency, difficulty = 'easy', identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/darts/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: toDifficultyEnum(difficulty),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['dartsBet'])
}

export async function placeCasesBet({ amount, currency, difficulty = 'easy', identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/cases/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: toCasesDifficultyEnum(difficulty),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['casesBet'])
}

export async function placeBarsBet({ amount, currency, difficulty = 'easy', tiles = [], identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/bars/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: toDifficultyEnum(difficulty),
    tiles: Array.isArray(tiles) ? tiles.filter((n) => n != null).map(Number) : [],
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['barsBet'])
}

export async function placeChickenBet({ amount, currency, round = 5, difficulty = 'medium', identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/chicken/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    round: Math.max(1, Number(round) || 1),
    difficulty: toDifficultyEnum(difficulty),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['chickenBet'])
}

export async function placeTarotBet({ amount, currency, difficulty = 'medium', identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/tarot/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    difficulty: toDifficultyEnum(difficulty),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['tarotBet'])
}

export async function placeRockPaperScissorsBet({ amount, currency, guesses = ['rock'], identifier }) {
  const g = Array.isArray(guesses) && guesses.length > 0 ? guesses.map(String) : ['rock']
  const res = await stakeCasinoRestPost('/_api/casino/rock-paper-scissors/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    guesses: g,
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['rockPaperScissorsBet'])
}

export async function placeScarabSpinBet({ amount, currency, lines = 1, identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/slots/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    lines: Math.max(1, Math.min(20, Number(lines) || 1)),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['slotsBet', 'scarabSpinBet'])
}

export async function placeSamuraiBet({ amount, currency, identifier }) {
  const cur = String(currency || 'usdc').toLowerCase()
  const res = await stakeCasinoRestPost('/_api/casino/slots-samurai/bet', {
    amount: Number(amount),
    currency: cur,
    identifier: identifier || randomRestIdentifier(),
  })
  let bet = pickRestBet(res, ['slotsSamuraiBet'])
  if (!bet) return null

  let state = res?.slotsSamuraiBet?.state ?? bet.state
  let guard = 0
  while (state?.nextSpinType && state.nextSpinType !== 'complete' && guard < 20) {
    guard++
    const nextRes = await stakeCasinoRestPost('/_api/casino/slots-samurai/next', { currency: cur })
    const next = pickRestBet(nextRes, ['slotsSamuraiNext'])
    if (!next) break
    bet = {
      ...bet,
      ...next,
      payout: next.payout ?? bet.payout,
      payoutMultiplier: next.payoutMultiplier ?? bet.payoutMultiplier,
    }
    state = nextRes?.slotsSamuraiNext?.state ?? next.state
  }
  return normalizeCasinoBetRow(bet)
}

/** Packs — REST (auto identifier). GraphQL casesBet: use placePacksBet. */
export async function placePacksRestBet({ amount, currency, identifier }) {
  const res = await stakeCasinoRestPost('/_api/casino/packs/bet', {
    amount: Number(amount),
    currency: String(currency || 'usdc').toLowerCase(),
    identifier: identifier || randomRestIdentifier(),
  })
  return pickRestBet(res, ['packsBet'])
}

/**
 * No verified Stake API for these registry slugs (not in reference handlers).
 * Throws so manual/automatic modes surface an honest error.
 */
export async function placeUnsupportedOriginalsBet(game) {
  throw new Error(
    `${game}: no verified bet API — capture Network tab on stake.com when placing a manual bet to add the mutation/REST path.`
  )
}

/** @deprecated use placeUnsupportedOriginalsBet */
export async function placeOriginalsStubBet(game) {
  return placeUnsupportedOriginalsBet(game)
}
