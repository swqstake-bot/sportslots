/**

 * Challenge difficulty from StakeCruncher lookup tables (Stake Engine games).

 */



import {

  resolveCruncherBaseMode,

  fetchCruncherLookupTableBytes,

  computeTargetProbabilityFromLookup,

  clearCruncherClientCaches,

} from '../api/stakeCruncherClient'

import { isCruncherRateOrOverloadError } from '../api/stakeCruncherRequestQueue'

import { extractProviderGroupSlugFromGame } from './stakeRgsSlug'



/** @typedef {'easy'|'medium'|'hard'|'extreme'|'unknown'|'impossible'|'error'} DifficultyGrade */



/**

 * @typedef {Object} ChallengeDifficultyAssessment

 * @property {DifficultyGrade} grade

 * @property {string} label

 * @property {number|null} hitProbability per base spin

 * @property {number|null} expectedSpins ~1/p

 * @property {number|null} maxMulti game max from table

 * @property {'cruncher'|'none'} source

 * @property {string} [cruncherSlug]

 * @property {string} [mode]

 * @property {string} [hint] tooltip

 */



const assessmentCache = new Map()

const inflight = new Map()

let assessChain = Promise.resolve()



export const DIFFICULTY_LABELS = {

  easy: 'Easy',

  medium: 'Medium',

  hard: 'Hard',

  extreme: 'Extreme',

  impossible: 'Impossible',

  error: 'Error',

  unknown: '—',

}



export function difficultyGradeFromStats(probability, expectedSpins) {

  const p = Number(probability)

  const exp = Number(expectedSpins)

  if (!Number.isFinite(p) || p <= 0) return 'impossible'

  if (p >= 0.01 || (Number.isFinite(exp) && exp < 250)) return 'easy'

  if (p >= 0.001 || (Number.isFinite(exp) && exp < 2500)) return 'medium'

  if (p >= 0.00003 || (Number.isFinite(exp) && exp < 80000)) return 'hard'

  return 'extreme'

}



export function formatHitProbability(p) {

  const n = Number(p)

  if (!Number.isFinite(n) || n <= 0) return '0%'

  if (n >= 0.01) return `${(n * 100).toFixed(2)}%`

  if (n >= 0.0001) return `${(n * 100).toFixed(3)}%`

  return `${(n * 100).toFixed(4)}%`

}



export function formatExpectedSpins(n) {

  const v = Number(n)

  if (!Number.isFinite(v) || v <= 0) return '—'

  if (v < 1000) return `~${Math.round(v)}`

  if (v < 1_000_000) return `~${Math.round(v / 100) / 10}k`

  return `~${Math.round(v / 100_000) / 10}M`

}



function buildAssessment({ grade, hitProbability, expectedSpins, maxMulti, cruncherSlug, mode }) {

  const label = DIFFICULTY_LABELS[grade] || DIFFICULTY_LABELS.unknown

  const hint =

    grade === 'error'

      ? String(maxMulti || 'StakeCruncher request failed — see DevTools console [StakeCruncher]')

      : grade === 'unknown'

        ? 'Not on StakeCruncher (404) or third-party slot'

        : grade === 'impossible'

          ? `Target above game max (~${Number(maxMulti || 0).toFixed(0)}×)`

          : `${formatHitProbability(hitProbability)} hit per spin · ${formatExpectedSpins(expectedSpins)} spins (median order)`

  return {

    grade,

    label,

    hitProbability: hitProbability ?? null,

    expectedSpins: expectedSpins ?? null,

    maxMulti: maxMulti ?? null,

    source: grade === 'unknown' ? 'none' : 'cruncher',

    cruncherSlug,

    mode,

    hint,

  }

}



function cacheKey(challenge) {

  const slug = String(challenge?.gameSlug || challenge?.game?.slug || '').toLowerCase()

  const target = Number(challenge?.targetMultiplier)

  return `${slug}:${Number.isFinite(target) ? target.toFixed(2) : '0'}`

}



async function assessChallengeDifficultyInner(challenge, options = {}) {

  const key = cacheKey(challenge)

  if (options.force) {

    assessmentCache.delete(key)

  }

  if (!options.force && assessmentCache.has(key)) return assessmentCache.get(key)

  if (!options.force && inflight.has(key)) return inflight.get(key)



  const task = (async () => {

    const gameSlug = challenge?.gameSlug || challenge?.game?.slug

    const providerGroupSlug =

      challenge?.providerGroupSlug || extractProviderGroupSlugFromGame(challenge?.game)

    const targetMultiplier = Number(challenge?.targetMultiplier)

    if (!gameSlug || !(targetMultiplier > 1)) {

      console.warn('[StakeCruncher] skip: missing slug or target', { gameSlug, targetMultiplier })

      const a = buildAssessment({ grade: 'unknown' })

      assessmentCache.set(key, a)

      return a

    }



    const resolved = await resolveCruncherBaseMode(gameSlug, {
      providerGroupSlug,
      gameName: challenge?.gameName || challenge?.game?.name,
    })

    if (!resolved) {

      console.warn('[StakeCruncher] not on Cruncher (404)', { gameSlug, providerGroupSlug })

      const a = buildAssessment({ grade: 'unknown' })

      assessmentCache.set(key, a)

      return a

    }



    const maxFromMeta = Number(resolved.modeMeta?.largestPayoutX100) / 100

    if (Number.isFinite(maxFromMeta) && maxFromMeta > 0 && targetMultiplier > maxFromMeta * 1.001) {

      const a = buildAssessment({

        grade: 'impossible',

        maxMulti: maxFromMeta,

        cruncherSlug: resolved.slug,

        mode: resolved.mode,

      })

      assessmentCache.set(key, a)

      return a

    }



    try {

      const gzipBytes = await fetchCruncherLookupTableBytes(resolved.slug, resolved.version, resolved.mode)

      const { probability, maxMulti } = await computeTargetProbabilityFromLookup(gzipBytes, targetMultiplier)

      const expectedSpins = probability > 0 ? 1 / probability : null

      const grade = difficultyGradeFromStats(probability, expectedSpins)

      const a = buildAssessment({

        grade,

        hitProbability: probability,

        expectedSpins,

        maxMulti,

        cruncherSlug: resolved.slug,

        mode: resolved.mode,

      })

      assessmentCache.set(key, a)

      return a

    } catch (err) {

      const msg = err instanceof Error ? err.message : String(err)

      if (isCruncherRateOrOverloadError(err)) {

        console.warn('[StakeCruncher] rate limit / server busy (lookup)', {

          slug: resolved.slug,

          targetMultiplier,

          error: msg,

        })

        throw err

      }

      console.error('[StakeCruncher] lookup/probability failed', {

        slug: resolved.slug,

        version: resolved.version,

        mode: resolved.mode,

        targetMultiplier,

        error: msg,

      })

      if (/StakeCruncher HTTP|Electron API unavailable|IPC channel not allowed/i.test(msg)) {

        throw err

      }

      const a = buildAssessment({

        grade: 'unknown',

        cruncherSlug: resolved.slug,

        mode: resolved.mode,

        maxMulti: msg,

      })

      assessmentCache.set(key, a)

      return a

    }

  })()



  inflight.set(key, task)

  try {

    return await task

  } finally {

    inflight.delete(key)

  }

}



/**

 * @param {object} challenge

 * @param {{ force?: boolean }} [options]

 * @returns {Promise<ChallengeDifficultyAssessment>}

 */

export function assessChallengeDifficulty(challenge, options = {}) {

  const run = () => assessChallengeDifficultyInner(challenge, options)

  const result = assessChain.then(run, run)

  assessChain = result.catch(() => {})

  return result

}



/** Higher = easier (for sorting). */

export function difficultySortScore(assessment) {

  if (!assessment || assessment.grade === 'unknown') return -1

  if (assessment.grade === 'impossible') return -2

  const p = Number(assessment.hitProbability)

  if (Number.isFinite(p) && p > 0) return p

  const gradeScore = { easy: 0.05, medium: 0.005, hard: 0.0005, extreme: 0.00001 }

  return gradeScore[assessment.grade] ?? 0

}



export function clearDifficultyCache() {

  assessmentCache.clear()

  inflight.clear()

  clearCruncherClientCaches()

}



/**

 * Bewertet Challenges nacheinander (Cruncher-Queue) und sortiert: höchste Trefferwahrscheinlichkeit zuerst.

 * @param {object[]} challenges

 * @returns {Promise<Array<{ challenge: object, assessment: object|null, score: number }>>}

 */

export async function rankChallengesByCruncherEase(challenges) {

  const list = Array.isArray(challenges) ? challenges : []

  const results = []

  for (const challenge of list) {

    const target = Number(challenge?.targetMultiplier)

    const isOriginals = !!challenge?.isOriginalsChallenge

    if (isOriginals || !(target > 1)) {

      results.push({ challenge, assessment: null, score: -3 })

      continue

    }

    try {

      const assessment = await assessChallengeDifficulty(challenge)

      results.push({

        challenge: { ...challenge, cruncherAssessment: assessment },

        assessment,

        score: difficultySortScore(assessment),

      })

    } catch {

      results.push({ challenge, assessment: null, score: -1 })

    }

  }

  results.sort((a, b) => b.score - a.score)

  return results

}

