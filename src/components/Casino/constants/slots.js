/**
 * Slots werden ausschließlich dynamisch von der Stake-API geladen (slugKuratorGroup).
 * Keine statische Liste mehr – immer aktuell.
 */
export const SUPPORTED_SLOTS = []

export const PROVIDERS = {
  hacksaw: { id: 'hacksaw', name: 'Hacksaw Gaming', impl: 'web' },
  stakeEngine: { id: 'stakeEngine', name: 'Stake Engine', impl: 'web' },
  avatarux: { id: 'avatarux', name: 'Avatarux', impl: 'web' },
  bgaming: { id: 'bgaming', name: 'BGaming', impl: 'web' },
  'b-gaming': { id: 'b-gaming', name: 'BGaming', impl: 'web' },
  gamesglobal: { id: 'gamesglobal', name: 'Games Global', impl: 'web' },
  'games-global': { id: 'games-global', name: 'Games Global', impl: 'web' },
  jaderabbit: { id: 'jaderabbit', name: 'Jade Rabbit', impl: 'web' },
  'jade-rabbit': { id: 'jade-rabbit', name: 'Jade Rabbit', impl: 'web' },
  endorphina: { id: 'endorphina', name: 'Endorphina', impl: 'backend' },
  gamomat: { id: 'gamomat', name: 'Gamomat', impl: 'backend' },
  justslots: { id: 'justslots', name: 'Just Slots', impl: 'backend' },
  massive: { id: 'massive', name: 'Massive Studios', impl: 'backend' },
  'massive-studios': { id: 'massive-studios', name: 'Massive Studios', impl: 'backend' },
  octoplay: { id: 'octoplay', name: 'Octoplay', impl: 'backend' },
  'penguin-king': { id: 'penguin-king', name: 'Penguin King', impl: 'backend' },
  onetouch: { id: 'onetouch', name: 'One Touch', impl: 'backend' },
  'one-touch': { id: 'one-touch', name: 'One Touch', impl: 'backend' },
  'one-touch-games': { id: 'one-touch-games', name: 'One Touch', impl: 'backend' },
  petersons: { id: 'petersons', name: 'Peter & Sons', impl: 'web' },
  'peter-sons': { id: 'peter-sons', name: 'Peter & Sons', impl: 'web' },
  playngo: { id: 'playngo', name: "Play'n GO", impl: 'backend' },
  'play-n-go': { id: 'play-n-go', name: "Play'n GO", impl: 'backend' },
  popiplay: { id: 'popiplay', name: 'Popiplay', impl: 'backend' },
  pragmatic: { id: 'pragmatic', name: 'Pragmatic Play', impl: 'web' },
  'fat-panda': { id: 'fat-panda', name: 'Fat Panda', impl: 'web' },
  push: { id: 'push', name: 'Push Gaming', impl: 'backend' },
  redtiger: { id: 'redtiger', name: 'Red Tiger', impl: 'backend' },
  'red-tiger-gaming': { id: 'red-tiger-gaming', name: 'Red Tiger', impl: 'backend' },
  relax: { id: 'relax', name: 'Relax Gaming', impl: 'backend' },
  'print-studios': { id: 'print-studios', name: 'Print Studios', impl: 'backend' },
  printstudios: { id: 'printstudios', name: 'Print Studios', impl: 'backend' },
  shadylady: { id: 'shadylady', name: 'Shady Lady', impl: 'backend' },
  slotmill: { id: 'slotmill', name: 'Slotmill', impl: 'backend' },
  thunderkick: { id: 'thunderkick', name: 'Thunderkick', impl: 'webview' },
  truelab: { id: 'truelab', name: 'Truelab', impl: 'backend' },
  twist: { id: 'twist', name: 'Twist Gaming', impl: 'web' },
  'titan-gaming': { id: 'titan-gaming', name: 'Titan Gaming', impl: 'web' },
  valkyrie: { id: 'valkyrie', name: 'Valkyrie', impl: 'web' },
  nolimit: { id: 'nolimit', name: 'Nolimit City', impl: 'web' },
  'no-limit': { id: 'no-limit', name: 'Nolimit City', impl: 'web' },
  'no-limit-city': { id: 'no-limit-city', name: 'Nolimit City', impl: 'web' },
  nlc: { id: 'nlc', name: 'Nolimit City', impl: 'web' },
  clawbuster: { id: 'clawbuster', name: 'Claw Buster', impl: 'web' },
}

export function getWebReadySlots() {
  return []
}

export function getAllSlots() {
  return []
}

/** Slots nach Anbieter gruppiert: { providerId: { provider, slots } } */
export function getSlotsGroupedByProvider(slots) {
  const groups = {}
  for (const slot of slots || []) {
    const pid = slot.providerId || 'other'
    if (!groups[pid]) {
      groups[pid] = { provider: PROVIDERS[pid] || { id: pid, name: pid }, slots: [] }
    }
    groups[pid].slots.push(slot)
  }
  return groups
}
