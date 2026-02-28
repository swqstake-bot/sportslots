import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

const PAGE_SIZE = 5

const PROVIDER_MAP = {
  'hacksaw-gaming': 'hacksaw',
  'pragmatic-play': 'pragmatic',
  'no-limit-city': 'nolimit',
  'push-gaming': 'push',
  'relax-gaming': 'relax',
  'red-tiger': 'redtiger',
  'red-tiger-gaming': 'redtiger',
  'slotmill': 'slotmill',
  'thunderkick': 'thunderkick',
  'bgaming': 'bgaming',
  'endorphina': 'endorphina',
  'gamomat': 'gamomat',
  'avatarux': 'avatarux',
  'octoplay': 'octoplay',
  'one-touch': 'onetouch',
  'one-touch-games': 'onetouch',
  'popiplay': 'popiplay',
  'peter-and-sons': 'peter-sons',
  'playn-go': 'playngo',
  'justslots': 'justslots',
  'stake-originals': 'stakeEngine',
  'twist-gaming': 'stakeEngine',
  'paperclip-gaming': 'stakeEngine',
  'uppercut-gaming': 'stakeEngine',
  'sidequest-studios': 'stakeEngine',
  'backseat-gaming': 'stakeEngine',
  'titan-gaming': 'stakeEngine',
  'donut-gaming': 'stakeEngine',
  'massive-studios': 'stakeEngine',
  'knucklehead-gaming': 'stakeEngine',
  'blackcoffeestudios': 'stakeEngine',
  'evoslot': 'stakeEngine',
  'creativecity': 'stakeEngine',
  'valkyrie': 'stakeEngine',
  'd-bush-gaming': 'stakeEngine',
}

const SLUG_KURATOR_QUERY = `query SlugKuratorGroup($slug: String!, $limit: Int!, $offset: Int!, $sort: GameKuratorGroupGameSortEnum = popular7d, $filterIds: [String!], $locale: Locale = "en") {
  slugKuratorGroup(slug: $slug) {
    id name slug
    gameCount(filterIds: $filterIds, locale: $locale)
    groupGamesList(limit: $limit, offset: $offset, sort: $sort, filterIds: $filterIds, locale: $locale) {
      game { id name slug thumbnailUrl isBlocked isWidgetEnabled groupGames { group { id slug type } } }
    }
  }
}`

function mapGameToSlot(game) {
  if (!game?.slug || game.isBlocked) return null
  const providerGroup = game.groupGames?.find((g) => g?.group?.type === 'provider')
  const providerSlug = providerGroup?.group?.slug
  if (!providerSlug) return null
  const providerId = PROVIDER_MAP[providerSlug] || providerSlug
  return { slug: game.slug, name: game.name, providerId, thumbnailUrl: game.thumbnailUrl }
}

export async function fetchStakeSlots(accessToken) {
  // accessToken is unused here as StakeApi uses main process session
  const all = []
  let offset = 0
  let totalCount = null
  const t0 = Date.now()
  
  try {
    while (true) {
      const variables = { slug: 'slots', limit: PAGE_SIZE, offset, sort: 'popular7d' }
      
      const response = await StakeApi.query(SLUG_KURATOR_QUERY, variables)
      const data = response.data
      
      if (!data?.slugKuratorGroup) {
         throw new Error('Invalid response structure')
      }

      const group = data.slugKuratorGroup
      totalCount = group.gameCount
      const games = group.groupGamesList.map((g) => g.game)
      
      for (const game of games) {
        const slot = mapGameToSlot(game)
        if (slot) all.push(slot)
      }

      if (games.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      
      // Safety break – Stake API number_less_equal bei hohem offset (max ~100)
      if (offset >= 100) break 
    }
    
    logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { offset }, response: { count: all.length }, error: null, durationMs: Date.now() - t0 })
    return all
    
  } catch (error) {
    console.error('Fetch slots error', error)
    logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { offset }, response: null, error: error.message, durationMs: Date.now() - t0 })
    throw error
  }
}
