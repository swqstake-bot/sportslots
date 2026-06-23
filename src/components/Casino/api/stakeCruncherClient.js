/**
 * StakeCruncher public tracker API (Stake Engine slot math / lookup tables).
 * https://stakecruncher.com — fetched via Electron main (no CORS).
 */

import { stakeRgsCruncherSlugCandidates, stripStakeRgsPublisherPrefix } from '../utils/stakeRgsSlug'
import {
  enqueueCruncherRequest,
  isCruncherNotFoundStatus,
} from './stakeCruncherRequestQueue'

const CRUNCHER_ORIGIN = 'https://stakecruncher.com'
const DEBUG_CRUNCHER = typeof import.meta !== 'undefined' && import.meta.env?.DEV

function cruncherLog(level, message, detail) {
  if (level === 'info' && !DEBUG_CRUNCHER) return
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  if (detail !== undefined) fn(`[StakeCruncher] ${message}`, detail)
  else fn(`[StakeCruncher] ${message}`)
}

const gameMetaCache = new Map()
const lookupBytesCache = new Map()
const LOOKUP_CACHE_MAX = 6

async function cruncherFetchBytesOnce(path) {
  const api = window.electronAPI
  if (!api?.invoke) {
    const err = new Error('Electron API unavailable (cruncher-api-fetch needs Electron main)')
    err.status = 0
    cruncherLog('error', err.message, { path })
    throw err
  }
  cruncherLog('info', `GET ${path}`)
  let res
  try {
    res = await api.invoke('cruncher-api-fetch', { path })
  } catch (invokeErr) {
    const msg = invokeErr instanceof Error ? invokeErr.message : String(invokeErr)
    cruncherLog('error', `IPC cruncher-api-fetch failed: ${msg}`, { path })
    const err = invokeErr instanceof Error ? invokeErr : new Error(msg)
    err.status = 0
    throw err
  }
  if (!res?.ok) {
    const err = new Error(`StakeCruncher HTTP ${res?.status ?? 'error'}`)
    err.status = res?.status ?? 0
    if (isCruncherNotFoundStatus(err.status)) {
      cruncherLog('warn', err.message, { path, status: err.status })
    } else if (err.status === 429 || err.status === 503) {
      cruncherLog('warn', `${err.message} (rate limit / busy)`, { path, status: err.status })
    } else {
      cruncherLog('error', err.message, { path, status: err.status })
    }
    throw err
  }
  const b64 = String(res.bodyBase64 || '')
  if (!b64) {
    const err = new Error('StakeCruncher empty response body')
    err.status = 0
    cruncherLog('error', err.message, { path })
    throw err
  }
  cruncherLog('info', `OK ${path}`, { bytes: Math.round((b64.length * 3) / 4) })
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function cruncherFetchBytes(path) {
  return enqueueCruncherRequest(() => cruncherFetchBytesOnce(path))
}

async function cruncherFetchJson(path) {
  const buf = await cruncherFetchBytes(path)
  const text = new TextDecoder().decode(buf)
  return JSON.parse(text)
}

function normalizeGameSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
}

/** Cruncher API slug — Unterstriche beibehalten (z. B. 25_97). */
function cruncherSlugKey(slug) {
  return String(slug || '').trim().toLowerCase()
}

function cruncherSlugForPath(slug) {
  return encodeURIComponent(String(slug || '').trim())
}

function normalizeNameToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function publisherMatchTokens(providerGroupSlug) {
  const pg = normalizeGameSlug(providerGroupSlug)
  const tokens = new Set()
  if (!pg) return tokens
  tokens.add(pg)
  tokens.add(pg.replace(/-gaming$/, ''))
  tokens.add(pg.replace(/-/g, ''))
  if (pg.endsWith('-gaming')) {
    const studio = pg.slice(0, -'-gaming'.length)
    if (studio) tokens.add(studio)
    tokens.add(studio.replace(/-/g, ''))
  }
  if (pg === 'twist-gaming' || pg === 'twistgaming') tokens.add('twist')
  return tokens
}

function gameMatchesPublisher(game, providerGroupSlug) {
  if (!providerGroupSlug) return true
  const pub = cruncherSlugKey(game?.publisherSlug)
  const pubName = normalizeNameToken(game?.publisherName)
  for (const token of publisherMatchTokens(providerGroupSlug)) {
    if (!token) continue
    if (pub === token || pub.includes(token) || token.includes(pub)) return true
    if (pubName && normalizeNameToken(token) && pubName.includes(normalizeNameToken(token))) return true
  }
  return false
}

let catalogCache = null
let catalogCacheAt = 0
const CATALOG_TTL_MS = 10 * 60 * 1000

async function getCruncherCatalogGames() {
  if (catalogCache && Date.now() - catalogCacheAt < CATALOG_TTL_MS) return catalogCache
  const catalog = await cruncherFetchJson(
    '/tracker-api/engine/stats/games?limit=2000&sort=turnover&order=desc'
  )
  catalogCache = Array.isArray(catalog?.games) ? catalog.games : []
  catalogCacheAt = Date.now()
  return catalogCache
}

function isCruncherHttp404(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return /StakeCruncher HTTP 404/.test(msg)
}

/**
 * @param {string} gameSlug
 * @param {string} [providerGroupSlug]
 * @returns {string[]}
 */
export function cruncherSlugCandidates(gameSlug, providerGroupSlug) {
  return stakeRgsCruncherSlugCandidates(gameSlug, providerGroupSlug)
}

function findGameInCatalog(games, slug) {
  const want = normalizeGameSlug(slug)
  const wantRaw = cruncherSlugKey(slug)
  return (
    games.find((g) => cruncherSlugKey(g?.slug) === wantRaw) ||
    games.find((g) => normalizeGameSlug(g?.slug) === want) ||
    games.find((g) => normalizeGameSlug(g?.canonicalSlug) === want) ||
    games.find((g) => {
      const gs = normalizeGameSlug(g?.slug)
      return gs.endsWith(`-${want}`) || want.endsWith(`-${gs}`)
    })
  )
}

function findGameInCatalogByName(games, { gameName, providerGroupSlug, bareSlug }) {
  const fromName = normalizeNameToken(gameName)
  const fromSlug = normalizeNameToken(String(bareSlug || '').replace(/-/g, ' '))
  const targets = [...new Set([fromName, fromSlug].filter((t) => t.length >= 3))]
  if (!targets.length) return null

  const hits = games.filter((g) => {
    const gn = normalizeNameToken(g?.name)
    const nameOk = targets.some(
      (t) => t === gn || (t.length >= 4 && gn.includes(t)) || (gn.length >= 4 && t.includes(gn))
    )
    if (!nameOk) return false
    return gameMatchesPublisher(g, providerGroupSlug)
  })

  if (hits.length === 1) return hits[0]
  if (hits.length > 1 && fromName) {
    const exact = hits.find((g) => normalizeNameToken(g?.name) === fromName)
    if (exact) return exact
  }
  return hits[0] || null
}

function cacheResolvedGame(inputSlug, meta) {
  gameMetaCache.set(inputSlug, meta)
  const cruncherSlug = cruncherSlugKey(meta?.slug)
  if (cruncherSlug) gameMetaCache.set(cruncherSlug, meta)
}

function pickBaseMode(gameJson) {
  const modes = Array.isArray(gameJson?.modes) ? gameJson.modes : []
  const activeBase = modes.find((m) => m?.name === 'base' && m?.active)
  if (activeBase) return activeBase
  const anyBase = modes.find((m) => m?.name === 'base')
  if (anyBase) return anyBase
  return modes.find((m) => m?.active) || modes[0] || null
}

/**
 * @param {string} gameSlug Stake casino game slug
 * @param {{ providerGroupSlug?: string, gameName?: string }} [options]
 * @returns {Promise<object|null>}
 */
export async function resolveCruncherGame(gameSlug, options = {}) {
  const inputSlug = normalizeGameSlug(gameSlug)
  if (!inputSlug) return null
  if (gameMetaCache.has(inputSlug)) return gameMetaCache.get(inputSlug)

  const bareSlug = stripStakeRgsPublisherPrefix(inputSlug, options.providerGroupSlug)
  const candidates = cruncherSlugCandidates(inputSlug, options.providerGroupSlug)

  for (const candidate of candidates) {
    if (gameMetaCache.has(candidate)) {
      const cached = gameMetaCache.get(candidate)
      if (cached) {
        cacheResolvedGame(inputSlug, cached)
        return cached
      }
      continue
    }
    try {
      const meta = await cruncherFetchJson(
        `/tracker-api/engine/stats/games/${cruncherSlugForPath(candidate)}`
      )
      cacheResolvedGame(inputSlug, meta)
      if (candidate !== inputSlug) {
        cruncherLog('info', `resolved Stake slug ${inputSlug} → ${cruncherSlugKey(meta?.slug) || candidate}`)
      }
      return meta
    } catch (err) {
      if (isCruncherHttp404(err)) {
        cruncherLog('warn', `stats 404 for ${candidate}`)
        continue
      }
      cruncherLog('warn', `direct game lookup failed for ${candidate}`, err instanceof Error ? err.message : err)
    }
  }

  try {
    const games = await getCruncherCatalogGames()
    for (const candidate of candidates) {
      const hit = findGameInCatalog(games, candidate)
      if (hit) {
        cacheResolvedGame(inputSlug, hit)
        cruncherLog('info', `catalog slug matched ${inputSlug} → ${hit.slug}`)
        return hit
      }
    }
    const byName = findGameInCatalogByName(games, {
      gameName: options.gameName,
      providerGroupSlug: options.providerGroupSlug,
      bareSlug,
    })
    if (byName) {
      cacheResolvedGame(inputSlug, byName)
      cruncherLog('info', `catalog name matched ${inputSlug} → ${byName.slug} (${byName.name})`)
      return byName
    }
    cruncherLog('warn', `game not in StakeCruncher catalog`, {
      slug: inputSlug,
      bareSlug,
      gameName: options.gameName,
      tried: candidates,
    })
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    cruncherLog('error', `catalog lookup failed for ${inputSlug}`, msg)
    return null
  }
}

/**
 * @param {string} gameSlug
 * @param {{ providerGroupSlug?: string, gameName?: string }} [options]
 * @returns {Promise<{ slug: string, version: number, mode: string, modeMeta: object }|null>}
 */
export async function resolveCruncherBaseMode(gameSlug, options = {}) {
  const game = await resolveCruncherGame(gameSlug, options)
  if (!game) return null
  const modeRow = pickBaseMode(game)
  if (!modeRow?.name) return null
  const version = Number(modeRow.version || game.activeVersion)
  if (!Number.isFinite(version) || version <= 0) return null
  const slug = cruncherSlugKey(game.slug || gameSlug)
  let modeMeta = modeRow
  try {
    const detail = await cruncherFetchJson(
      `/tracker-api/engine/stats/games/${cruncherSlugForPath(slug)}/${version}/${encodeURIComponent(modeRow.name)}`
    )
    if (detail?.mode) modeMeta = { ...modeRow, ...detail.mode }
  } catch {
    /* summary row is enough */
  }
  return { slug, version, mode: modeRow.name, modeMeta }
}

export async function fetchCruncherLookupTableBytes(slug, version, mode = 'base') {
  const key = `${slug}:${version}:${mode}`
  if (lookupBytesCache.has(key)) return lookupBytesCache.get(key)
  const path = `/tracker-api/engine/verifier/lookup-table?slug=${encodeURIComponent(slug)}&version=${version}&mode=${encodeURIComponent(mode)}&_lv=5`
  const bytes = await cruncherFetchBytes(path)
  lookupBytesCache.set(key, bytes)
  while (lookupBytesCache.size > LOOKUP_CACHE_MAX) {
    const first = lookupBytesCache.keys().next().value
    lookupBytesCache.delete(first)
  }
  return bytes
}

let probWorker = null
let probJobSeq = 0

function getProbWorker() {
  if (probWorker) return probWorker
  probWorker = new Worker(new URL('../workers/stakeCruncherProb.worker.js', import.meta.url), {
    type: 'module',
  })
  return probWorker
}

/**
 * @param {ArrayBuffer} gzipBytes
 * @param {number} targetMultiplier e.g. 510
 * @returns {Promise<{ probability: number, maxMulti: number }>}
 */
export function computeTargetProbabilityFromLookup(gzipBytes, targetMultiplier) {
  const targetX100 = Math.round(Number(targetMultiplier) * 100)
  if (!(targetX100 > 0)) return Promise.reject(new Error('invalid_target'))
  const worker = getProbWorker()
  const jobId = `sc_${Date.now()}_${++probJobSeq}`
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      if (ev.data?.jobId !== jobId) return
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      if (ev.data?.error) reject(new Error(ev.data.error))
      else resolve({ probability: ev.data.probability, maxMulti: ev.data.maxMulti })
    }
    const onError = (err) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      reject(err)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    const payload = gzipBytes.slice(0)
    worker.postMessage({ jobId, gzipBytes: payload, targetX100 }, [payload])
  })
}

export function clearCruncherClientCaches() {
  gameMetaCache.clear()
  lookupBytesCache.clear()
  catalogCache = null
  catalogCacheAt = 0
}

if (typeof window !== 'undefined') {
  window.__stakeCruncherTest = async (gameSlug, targetMultiplier = 510) => {
    try {
      const resolved = await resolveCruncherBaseMode(gameSlug)
      console.log('[StakeCruncher] resolved', resolved)
      if (!resolved) return { error: 'no_cruncher_game' }
      const bytes = await fetchCruncherLookupTableBytes(resolved.slug, resolved.version, resolved.mode)
      const prob = await computeTargetProbabilityFromLookup(bytes, targetMultiplier)
      console.log('[StakeCruncher] probability', prob)
      return { resolved, prob }
    } catch (err) {
      console.error('[StakeCruncher] __stakeCruncherTest failed', err)
      throw err
    }
  }
}

export { CRUNCHER_ORIGIN }
