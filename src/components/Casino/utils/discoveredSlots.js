/**
 * Slots, die beim Challenges-Scan neu gefunden wurden.
 * Werden lokal in localStorage persistiert (inkl. Icons/thumbnailUrl).
 */
import { PROVIDERS } from '../constants/slots'

const DISCOVERED_SLOTS_KEY = 'slotbot_discovered_slots'

export function loadDiscoveredSlots() {
  try {
    const raw = localStorage.getItem(DISCOVERED_SLOTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDiscoveredSlots(list) {
  try {
    localStorage.setItem(DISCOVERED_SLOTS_KEY, JSON.stringify(list))
  } catch (_) {}
}

export function inferProviderId(slug) {
  if (!slug || typeof slug !== 'string') return 'stakeEngine'
  const s = slug.toLowerCase()

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
  if (s.startsWith('dbushgaming-')) return 'stakeEngine'
  if (s.startsWith('sexyrabbit-') || s.startsWith('sexy-rabbit-') || s.startsWith('videoslots-')) return 'pragmatic' // Rabbit Heist – gs2c wie Pragmatic
  if (s.startsWith('popiplay-')) return 'popiplay'
  if (s.startsWith('helio-')) return 'helio'
  if (s.startsWith('samurai-')) return 'samurai'

  return 'stakeEngine'
}

/**
 * Fügt neue Slugs aus Challenges hinzu, die noch nicht in der Slot-Liste sind.
 * @param {Array<{ gameSlug?: string, gameName?: string, thumbnailUrl?: string, game?: { slug?: string, name?: string, thumbnailUrl?: string } }>} challenges
 * @param {Set<string>} knownSlugs - bereits bekannte Slugs (z.B. aus webSlots)
 * @returns {Array<{ slug: string, name: string, providerId: string, thumbnailUrl?: string }>} neu hinzugefügte
 */
export function addDiscoveredFromChallenges(challenges, knownSlugs = new Set()) {
  if (!challenges?.length) return []
  const added = []

  for (const c of challenges) {
    const slug = c.gameSlug || c.game?.slug
    if (!slug || knownSlugs.has(slug)) continue

    const providerId = inferProviderId(slug)
    if (PROVIDERS[providerId]?.impl !== 'web') continue

    const name = c.gameName || c.game?.name || slug
    const thumbnailUrl = c.thumbnailUrl || c.game?.thumbnailUrl
    added.push({ slug, name, providerId, thumbnailUrl: thumbnailUrl || undefined })
    knownSlugs.add(slug)
  }

  return added
}
