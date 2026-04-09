/**
 * Slots, die beim Challenges-Scan neu gefunden wurden.
 * Werden lokal in localStorage persistiert (inkl. Icons/thumbnailUrl).
 */
import { getStakeEngineGameSlugPrefixes, mapProviderSlugToProviderId } from '../api/stakeSlotsApi'
import { PROVIDERS } from '../constants/slots'
import { CASINO_STORAGE_KEYS, readStorageJson, writeStorageJson } from './storageRegistry'

const DISCOVERED_SLOTS_KEY = CASINO_STORAGE_KEYS.discoveredSlots

export function loadDiscoveredSlots() {
  try {
    const parsed = readStorageJson(DISCOVERED_SLOTS_KEY, [])
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDiscoveredSlots(list) {
  writeStorageJson(DISCOVERED_SLOTS_KEY, list)
}

export function inferProviderId(slug) {
  if (!slug || typeof slug !== 'string') return 'stakeEngine'
  const s = slug.toLowerCase()

  if (s.startsWith('hacksaw-')) return 'hacksaw'
  if (s.startsWith('hacksaw-openrgs-')) return 'hacksaw'
  if (s.startsWith('backseat-gaming-') || s.startsWith('backseatgaming-')) return 'hacksaw'
  if (s.startsWith('bullshark-games-') || s.startsWith('bullsharkgames-')) return 'hacksaw'
  if (s.startsWith('pragmatic-play-') || s.startsWith('pragmatic-')) return 'pragmatic'
  if (s.startsWith('fat-panda-')) return 'pragmatic'
  if (
    s.startsWith('nolimit-') ||
    s.startsWith('no-limit-') ||
    s.startsWith('no-limit-city-') ||
    s.startsWith('nlc-')
  ) return 'nolimit'
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
  if (s.startsWith('one-touch-') || s.startsWith('onetouch-')) return 'onetouch'
  if (s.startsWith('gamomat-')) return 'gamomat'
  if (s.startsWith('games-global-') || s.startsWith('gamesglobal-')) return 'gamesglobal'
  if (s.startsWith('jade-rabbit-') || s.startsWith('jaderabbit-')) return 'jaderabbit'
  if (s.startsWith('penguin-king-')) return 'octoplay'
  if (s.startsWith('massive-')) return 'massive'
  if (s.startsWith('truelab-') || s.startsWith('true-lab-')) return 'truelab'
  if (s.startsWith('slotmill-')) return 'slotmill'
  if (s.startsWith('octoplay-')) return 'octoplay'
  if (s.startsWith('peter-sons-') || s.startsWith('peterandsons-') || s.startsWith('petersons-')) return 'peterandsons'
  if (s.startsWith('shady-')) return 'shady'
  if (s.startsWith('shuffle-')) return 'shuffle'
  /**
   * Stake Engine / RGS: Präfixe aus PROVIDER_MAP (getStakeEngineGameSlugPrefixes).
   * Muss vor `titan-` / `twist-` stehen (z. B. twist-gaming- vs twist-).
   */
  for (const p of getStakeEngineGameSlugPrefixes()) {
    if (s.startsWith(p)) return 'stakeEngine'
  }
  /**
   * Neue RGS-Studios: Spiel-Slug enthält *-gaming-* (nach relax-/push-/blueprint-… oben).
   * Ohne manuelle Provider-Liste erweiterbar.
   */
  if (s.includes('-gaming-')) return 'stakeEngine'
  if (s.startsWith('justslots-')) return 'justslots'
  if (s.startsWith('titan-')) return 'titan'
  if (s.startsWith('twist-')) return 'twist'
  if (s.startsWith('clawbuster-')) return 'clawbuster'
  if (s.startsWith('sexyrabbit-') || s.startsWith('sexy-rabbit-') || s.startsWith('videoslots-')) return 'pragmatic' // Rabbit Heist – gs2c wie Pragmatic
  if (s.startsWith('popiplay-')) return 'popiplay'
  if (s.startsWith('helio-')) return 'helio'
  if (s.startsWith('samurai-')) return 'samurai'

  return 'stakeEngine'
}

function extractProviderGroupSlugFromChallenge(c) {
  if (c.providerGroupSlug) return c.providerGroupSlug
  const gg = c.game?.groupGames
  if (!gg?.length) return null
  const providerGroup = gg.find((g) => g?.group?.type === 'provider')
  return providerGroup?.group?.slug || null
}

function resolveProviderIdFromChallenge(c) {
  const pg = extractProviderGroupSlugFromChallenge(c)
  if (pg) return mapProviderSlugToProviderId(pg)
  const slug = c.gameSlug || c.game?.slug
  return inferProviderId(slug)
}

function isDiscoverableWebProvider(providerId) {
  const p = PROVIDERS[providerId]
  if (p?.impl === 'web') return true
  if (p && (p.impl === 'backend' || p.impl === 'webview')) return false
  // Unbekannte Gruppen-Slugs werden in mapProviderSlugToProviderId als stakeEngine gemappt
  return true
}

/**
 * Fügt neue Slugs aus Challenges hinzu, die noch nicht in der Slot-Liste sind.
 * @param {Array<{ gameSlug?: string, gameName?: string, thumbnailUrl?: string, providerGroupSlug?: string, game?: { slug?: string, name?: string, thumbnailUrl?: string, groupGames?: Array<{ group?: { slug?: string, type?: string } }> } }>} challenges
 * @param {Set<string>} knownSlugs - bereits bekannte Slugs (z.B. aus webSlots)
 * @returns {Array<{ slug: string, name: string, providerId: string, thumbnailUrl?: string }>} neu hinzugefügte
 */
export function addDiscoveredFromChallenges(challenges, knownSlugs = new Set()) {
  if (!challenges?.length) return []
  const added = []

  for (const c of challenges) {
    const slug = c.gameSlug || c.game?.slug
    if (!slug || knownSlugs.has(slug)) continue

    const providerId = resolveProviderIdFromChallenge(c)
    if (!isDiscoverableWebProvider(providerId)) continue

    const name = c.gameName || c.game?.name || slug
    const thumbnailUrl = c.thumbnailUrl || c.game?.thumbnailUrl
    added.push({ slug, name, providerId, thumbnailUrl: thumbnailUrl || undefined })
    knownSlugs.add(slug)
  }

  return added
}
