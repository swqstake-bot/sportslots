/**
 * Slots, die beim Challenges-Scan neu gefunden wurden.
 * Persistiert in localStorage, um sie automatisch zur Slot-Liste hinzuzufügen.
 */
import { getWebReadySlots, PROVIDERS } from '../constants/slots'

const STORAGE_KEY = 'slotbot_discovered_slots'

export function inferProviderId(slug) {
  if (!slug || typeof slug !== 'string') return 'stakeEngine'
  const s = slug.toLowerCase()

  // Bekannte Provider-Prefixe
  if (s.startsWith('hacksaw-')) return 'hacksaw'
  if (s.startsWith('pragmatic-play-') || s.startsWith('pragmatic-')) return 'pragmatic'
  if (s.startsWith('nolimit-')) return 'nolimit'
  if (s.startsWith('avatarux-')) return 'avatarux'
  if (s.startsWith('relax-')) return 'relax'
  if (s.startsWith('blueprint-')) return 'blueprint'
  if (s.startsWith('endorphina-')) return 'endorphina'
  if (s.startsWith('thunderkick-')) return 'thunderkick'
  if (s.startsWith('netent-')) return 'netent'
  if (s.startsWith('gameart-')) return 'gameart'
  if (s.startsWith('push-gaming-') || s.startsWith('push-')) return 'push'
  if (s.startsWith('big-time-gaming-') || s.startsWith('btg-')) return 'btg'
  if (s.startsWith('oak-')) return 'oak'
  if (s.startsWith('red-tiger-') || s.startsWith('redtiger-')) return 'redtiger'
  if (s.startsWith('playngo-') || s.startsWith('play-n-go-')) return 'playngo'
  if (s.startsWith('octoplay-')) return 'octoplay'
  if (s.startsWith('peter-sons-') || s.startsWith('peterandsons-')) return 'peterandsons'
  if (s.startsWith('shady-')) return 'shady'
  if (s.startsWith('shuffle-')) return 'shuffle'
  if (s.startsWith('titan-')) return 'titan'
  if (s.startsWith('twist-')) return 'twist'
  if (s.startsWith('popiplay-')) return 'popiplay'
  if (s.startsWith('helio-')) return 'helio'
  if (s.startsWith('samurai-')) return 'samurai'
  
  // Standard-Fallback
  return 'stakeEngine'
}

/**
 * @returns {Array<{ slug: string, name: string, providerId: string }>}
 */
export function loadDiscoveredSlots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveDiscoveredSlots(slots) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
  } catch (_) {}
}

/**
 * Fügt neue Slugs aus Challenges hinzu, die noch nicht in der Slot-Liste sind.
 * @param {Array<{ gameSlug?: string, gameName?: string }>} challenges
 * @returns {Array<{ slug: string, name: string, providerId: string }>} neu hinzugefügte
 */
export function addDiscoveredFromChallenges(challenges) {
  if (!challenges?.length) return []
  const base = getWebReadySlots()
  const known = new Set(base.map((s) => s.slug))
  const discovered = loadDiscoveredSlots()
  for (const d of discovered) known.add(d.slug)

  const added = []
  for (const c of challenges) {
    const slug = c.gameSlug || c.game?.slug
    if (!slug || known.has(slug)) continue
    // if (slug.toLowerCase().startsWith('nolimit-')) continue // NoLimit jetzt unterstützt
    const providerId = inferProviderId(slug)
    if (PROVIDERS[providerId]?.impl !== 'web') continue
    const name = c.gameName || c.game?.name || slug
    discovered.push({ slug, name, providerId })
    known.add(slug)
    added.push({ slug, name, providerId })
  }
  if (added.length) saveDiscoveredSlots(discovered)
  return added
}

/**
 * Merge von Basis-Slots und discovered.
 * @param {Array} baseSlots
 * @param {Array} discovered
 * @returns {Array}
 */
export function mergeSlots(baseSlots, discovered) {
  const bySlug = new Map()
  for (const s of baseSlots || []) bySlug.set(s.slug, s)
  for (const s of discovered || []) {
    if (!bySlug.has(s.slug)) bySlug.set(s.slug, { ...s })
  }
  return [...bySlug.values()]
}
