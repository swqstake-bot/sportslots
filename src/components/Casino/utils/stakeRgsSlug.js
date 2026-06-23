/**
 * Stake RGS / Stake Engine: Spiel-Slugs ohne Publisher-Präfix (für StakeCruncher & Matching).
 * Stake liefert z. B. donutgaming-cupidon-in-paris — Cruncher/RGS nutzen cupidon-in-paris.
 */

import { getStakeEngineGameSlugPrefixes } from '../api/stakeSlotsApi'

export function normalizeStakeGameSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
}

function providerGroupSlugToPrefixes(providerGroupSlug) {
  const pg = normalizeStakeGameSlug(providerGroupSlug)
  if (!pg) return []
  const out = new Set([`${pg}-`])
  const compact = pg.replace(/-/g, '')
  if (compact && compact !== pg) out.add(`${compact}-`)
  if (pg.endsWith('-gaming')) {
    const studio = pg.slice(0, -'-gaming'.length)
    const studioCompact = studio.replace(/-/g, '')
    if (studio) out.add(`${studio}-`)
    if (studioCompact) out.add(`${studioCompact}-`)
  } else if (!pg.endsWith('gaming')) {
    out.add(`${pg}-gaming-`)
    out.add(`${compact}gaming-`)
  }
  if (pg === 'twist-gaming' || pg === 'twistgaming') {
    out.add('twist-')
    out.add('twistgaming-')
  }
  return [...out]
}

let cachedPublisherPrefixes = null

/** Längste Präfixe zuerst (donut-gaming- vor donut-). */
export function getStakeRgsPublisherPrefixes() {
  if (cachedPublisherPrefixes) return cachedPublisherPrefixes
  cachedPublisherPrefixes = [...getStakeEngineGameSlugPrefixes()].sort((a, b) => b.length - a.length)
  return cachedPublisherPrefixes
}

/**
 * Entfernt bekanntes Stake-RGS-Publisher-Präfix vom Spiel-Slug.
 * @param {string} slug Voller Stake-Slug
 * @param {string} [providerGroupSlug] optional: group.slug vom Challenge/Game-Objekt
 * @returns {string} Bare game slug (unverändert wenn kein Präfix passt)
 */
export function stripStakeRgsPublisherPrefix(slug, providerGroupSlug) {
  const s = normalizeStakeGameSlug(slug)
  if (!s) return s

  const prefixes = [...getStakeRgsPublisherPrefixes()]
  if (providerGroupSlug) {
    for (const p of providerGroupSlugToPrefixes(providerGroupSlug)) {
      if (!prefixes.includes(p)) prefixes.push(p)
    }
    prefixes.sort((a, b) => b.length - a.length)
  }

  for (const prefix of prefixes) {
    if (s.startsWith(prefix)) {
      const bare = s.slice(prefix.length)
      if (bare.length >= 2) return bare
    }
  }
  return s
}

/**
 * Kandidaten für StakeCruncher (bare slug zuerst).
 * @param {string} gameSlug
 * @param {string} [providerGroupSlug]
 * @returns {string[]}
 */
export function stakeRgsCruncherSlugCandidates(gameSlug, providerGroupSlug) {
  const base = normalizeStakeGameSlug(gameSlug)
  if (!base) return []
  const bare = stripStakeRgsPublisherPrefix(base, providerGroupSlug)
  const out = []
  if (bare && bare !== base) out.push(bare)
  out.push(base)
  if (bare === base) {
    const dash = base.indexOf('-')
    if (dash > 0) {
      const fallback = base.slice(dash + 1)
      if (fallback.length >= 3) out.push(fallback)
    }
  }
  return [...new Set(out)]
}

export function extractProviderGroupSlugFromGame(game) {
  if (!game) return null
  const gg = game.groupGames
  if (!Array.isArray(gg) || !gg.length) return null
  const providerGroup = gg.find((g) => g?.group?.type === 'provider')
  return providerGroup?.group?.slug || null
}
