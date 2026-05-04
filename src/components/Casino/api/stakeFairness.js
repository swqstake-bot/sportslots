import { StakeApi } from '../../../api/client'

/**
 * Wie im HAR von Stake Web: Referer auf Fairness-Modal des Slots (sonst oft GraphQL-Fehler z. B. 612176).
 * @param {string} origin z. B. https://stake.com
 * @param {string} locale z. B. de, en
 * @param {string} gameSlug URL-Pfad-Slug (z. B. valkyrie-tome-of-hades)
 * @param {string} gameId Stake-Spiel-UUID
 * @param {'overview' | 'seeds'} [fairnessTab] Modal: zuerst `overview` (HAR), RotateSeed mit `seeds`
 */
export function buildStakeCasinoFairnessReferer(origin, locale, gameSlug, gameId, fairnessTab = 'seeds') {
  const o = String(origin || '').replace(/\/+$/, '')
  const gid = String(gameId || '').trim()
  const slug = String(gameSlug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  if (!o || !gid || !slug) return ''
  const locRaw = String(locale || 'en')
    .trim()
    .toLowerCase()
    .split('-')[0]
  const loc = /^[a-z]{2}$/.test(locRaw) ? locRaw : 'en'
  const tab = fairnessTab === 'overview' ? 'overview' : 'seeds'
  return `${o}/${loc}/casino/games/${encodeURIComponent(slug)}?tab=${tab}&game=${encodeURIComponent(gid)}&modal=fairnessStakeEngine`
}

/** Wie Seedchange2 beim Öffnen des Fairness-Modals: direkt nach `UserGameFair` (overview). */
const GAME_INFORMATION_QUERY = `query GameInformation($gameId: String!) {
  gameInformation(gameId: $gameId) {
    name
    version {
      version
      active
      created
      modes {
        costMultiplier
        name
        weightSum
        rtp
        eventCount
      }
      __typename
    }
    __typename
  }
}`

/** Stake Casino-Slots / RGS: Fairness pro Spiel (`gameId` = UUID aus Kurator-API), nicht `rotateSeedPair` (Originals). */
const USER_GAME_FAIR_QUERY = `query UserGameFair($gameId: String!) {
  userGameFair(gameId: $gameId) {
    clientSeed
    nonce
    serverSeedHash
    serverSeedNext
    __typename
  }
}`

const ROTATE_SEED_RGS_MUTATION = `mutation RotateSeed($clientSeed: String!, $gameId: String!, $nextHashedServerSeed: String!) {
  rotateSeed(
    clientSeed: $clientSeed
    gameId: $gameId
    nextHashedServerSeed: $nextHashedServerSeed
  ) {
    activeSeed {
      clientSeed
      nonce
      serverSeedHash
      serverSeedNext
      __typename
    }
    revealedSeed {
      clientSeed
      serverSeedHash
      __typename
    }
    __typename
  }
}`

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

/** Originals `rotateSeedPair`: längerer Freitext-Seed ok. */
function randomClientSeed() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/** RGS/Casino-Slot `rotateSeed` (HAR Seedchange3): genau 8 Zeichen, nur [A-Za-z0-9]. */
const RGS_CLIENT_SEED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const RGS_CLIENT_SEED_LEN = 8

function randomRgsFairnessClientSeed() {
  let s = ''
  for (let i = 0; i < RGS_CLIENT_SEED_LEN; i++) {
    s += RGS_CLIENT_SEED_CHARS[Math.floor(Math.random() * RGS_CLIENT_SEED_CHARS.length)]
  }
  return s
}

function pickStakeRgsClientSeed(clientSeed) {
  const raw = String(clientSeed || '').trim()
  if (raw && /^[A-Za-z0-9]{8}$/.test(raw)) return raw
  return randomRgsFairnessClientSeed()
}

export async function rotateStakeSeedPair(seed) {
  const variables = { seed: seed || randomClientSeed() }
  const res = await StakeApi.mutate(ROTATE_SEED_PAIR_MUTATION, variables)
  return {
    ok: !!res?.data?.rotateSeedPair,
    seed: variables.seed,
    result: res?.data?.rotateSeedPair ?? null,
  }
}

/**
 * Provably-fair Seed für einen Stake-Casino-Slot (RGS / Third-Party mit gameId).
 * `nextHashedServerSeed` = aktueller `userGameFair.serverSeedNext` (nächster Server-Seed-Hash in der Kette).
 * @param {string} gameId Stake-Spiel-UUID (Kurator `game.id`, nicht Slug)
 * @param {string} [clientSeed] optional — nur gültig wenn exakt 8 Zeichen [A-Za-z0-9], sonst neuer Zufalls-Seed
 * @param {{ referer?: string, language?: string }} [options] Referer + x-language wie Seedchange2.har (`tab=seeds`, `x-language: de`).
 * @returns {Promise<{ ok: boolean, seed?: string, result?: unknown, error?: string, gameId?: string }>}
 */
export async function rotateStakeRgsGameSeed(gameId, clientSeed, options = {}) {
  const gid = String(gameId || '').trim()
  if (!gid) {
    return { ok: false, error: 'missing_gameId', gameId: '' }
  }

  const seedsReferer = String(options?.referer || '').trim()
  const overviewReferer =
    seedsReferer && /\btab=seeds\b/.test(seedsReferer)
      ? seedsReferer.replace(/\btab=seeds\b/, 'tab=overview')
      : seedsReferer

  const optsSeeds = {}
  if (options?.language) optsSeeds.language = options.language
  if (seedsReferer) optsSeeds.referer = seedsReferer

  const optsOverview = {}
  if (options?.language) optsOverview.language = options.language
  if (overviewReferer) optsOverview.referer = overviewReferer

  /** Wie Browser: Fairness-Modal „Overview“ lädt `GameInformation` + `UserGameFair`, Rotate mit `tab=seeds`. */
  if (overviewReferer) {
    try {
      await StakeApi.query(GAME_INFORMATION_QUERY, { gameId: gid }, optsOverview)
    } catch (_) {
      /* Prime optional — ohne Blockade */
    }
    try {
      await StakeApi.query(USER_GAME_FAIR_QUERY, { gameId: gid }, optsOverview)
    } catch (_) {
      /* idem */
    }
  }

  const maxRotateAttempts = 5
  let lastError = ''

  for (let attempt = 0; attempt < maxRotateAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 100 * attempt))
    }

    const fairRes = await StakeApi.query(USER_GAME_FAIR_QUERY, { gameId: gid }, optsOverview)
    const fair = fairRes?.data?.userGameFair
    const nextHashed = fair?.serverSeedNext != null ? String(fair.serverSeedNext).trim() : ''
    if (!nextHashed) {
      return {
        ok: false,
        error: 'userGameFair ohne serverSeedNext (falsche gameId oder Spiel ohne PF?)',
        gameId: gid,
      }
    }

    const seed = pickStakeRgsClientSeed(clientSeed)
    try {
      const mutRes = await StakeApi.mutate(
        ROTATE_SEED_RGS_MUTATION,
        {
          clientSeed: seed,
          gameId: gid,
          nextHashedServerSeed: nextHashed,
        },
        optsSeeds
      )
      const rotated = mutRes?.data?.rotateSeed
      const active = rotated?.activeSeed
      const ok = !!active?.clientSeed

      if (import.meta.env.DEV) {
        console.info('[stakeFairness] rotateStakeRgsGameSeed', {
          gameId: gid,
          attempt: attempt + 1,
          ok,
          clientSeed: active?.clientSeed ?? seed,
          serverSeedHash: active?.serverSeedHash,
          revealedClientSeed: rotated?.revealedSeed?.clientSeed,
        })
      }

      if (!ok) {
        lastError = 'rotateSeed ohne activeSeed'
        continue
      }

      return {
        ok: true,
        seed: active?.clientSeed ?? seed,
        result: rotated ?? null,
        gameId: gid,
      }
    } catch (e) {
      lastError = String(e?.message || e)
      if (import.meta.env.DEV) {
        console.warn('[stakeFairness] rotateStakeRgsGameSeed attempt failed', {
          attempt: attempt + 1,
          message: lastError,
        })
      }
    }
  }

  return {
    ok: false,
    gameId: gid,
    error: lastError || 'rotateSeed nach mehreren Versuchen fehlgeschlagen',
  }
}
