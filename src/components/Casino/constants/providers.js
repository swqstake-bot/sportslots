import { HACKSAW_API_BASE, HACKSAW_USER_AGENT } from '../api/providers/hacksawShared'

const DEFAULT_PROVIDER_CAPABILITIES = {
  supportsBonus: true,
  needsKeepAlive: false,
  unitProfile: 'minor',
  retryProfile: { maxAttempts: 1, baseDelayMs: 0 },
  sessionShape: 'standard',
}
export const PROVIDERS = {
  hacksaw: {
    id: 'hacksaw',
    name: 'Hacksaw Gaming',
    apiBase: HACKSAW_API_BASE,
    userAgent: HACKSAW_USER_AGENT,
    sessionFields: ['token', 'sessionUuid', 'seq'],
    betLevelsSource: 'api',
    continuePolicy: 'instructions-or-win_presentation_complete',
    supportsMultiCurrencySameSlot: false,
    needsKeepAlive: true,
    unitProfile: 'major-housebets/minor-parser',
    retryProfile: { maxAttempts: 2, baseDelayMs: 250 },
    sessionShape: 'token-seq',
  },
  pragmatic: {
    id: 'pragmatic',
    name: 'Pragmatic Play',
    supportsMultiCurrencySameSlot: true,
    gameServicePathV4: '/gs2c/ge/v4/gameService',
    gameServicePathV3: '/gs2c/ge/v3/gameService',
    zeroDecimalCurrencies: ['idr', 'jpy', 'krw', 'vnd'],
    sessionFields: ['mgckey', 'symbol', 'host', 'index', 'counter'],
    betLevelsSource: 'doInit-parse',
    cUnitPolicy: 'minor-or-zero-decimal',
    needsKeepAlive: false,
    unitProfile: 'provider-major->minor-parser',
    retryProfile: { maxAttempts: 3, baseDelayMs: 300 },
    sessionShape: 'index-counter',
  },
  stakeEngine: {
    id: 'stakeEngine',
    name: 'Stake Engine',
    supportsMultiCurrencySameSlot: true,
    amountScale: 1000000,
    zeroDecimalCurrencies: ['idr', 'jpy', 'krw', 'vnd'],
    sessionFields: ['sessionID', 'rgsUrl'],
    betLevelsSource: 'config-betLevels',
    playEndpoints: { play: '/wallet/play', endRound: '/wallet/end-round', authenticate: '/wallet/authenticate' },
    bonusResolution: 'server-autoplay',
    instantBonus: true,
    needsKeepAlive: false,
    unitProfile: 'api-multiplier-1e6',
    retryProfile: { maxAttempts: 2, baseDelayMs: 300 },
    sessionShape: 'session-id',
  },
  '1000lakes': {
    id: '1000lakes',
    name: '1000 Lakes Studios',
    aliasOf: 'stakeEngine',
  },
  nolimit: {
    id: 'nolimit',
    name: 'Nolimit City',
    supportsMultiCurrencySameSlot: true,
    protocol: '@nolimit/game-communication@0.1.48',
    requiresExtPlayerKey: true,
    modes: { standard: 'CAP_MODE_STANDARD' },
    freeSpinModes: ['NORMAL_AVALANCHE', 'FREESPIN_AVALANCHE', 'FREESPIN_COOL_AVALANCHE'],
    betLevelsSource: 'open_game.chipAmounts',
    retryProfile: { maxAttempts: 2, baseDelayMs: 350 },
    sessionShape: 'ext-player-key',
  },
  paperclip: {
    id: 'paperclip',
    name: 'Paperclip',
    aliasOf: 'stakeEngine',
    bonusResolution: 'server-autoplay',
    instantBonus: true,
  },
  relax: {
    id: 'relax',
    name: 'Relax Gaming',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint Gaming',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  endorphina: {
    id: 'endorphina',
    name: 'Endorphina',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  thunderkick: {
    id: 'thunderkick',
    name: 'Thunderkick',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  netent: {
    id: 'netent',
    name: 'NetEnt',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  gameart: {
    id: 'gameart',
    name: 'GameArt',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  push: {
    id: 'push',
    name: 'Push Gaming',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  btg: {
    id: 'btg',
    name: 'Big Time Gaming',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  oak: {
    id: 'oak',
    name: 'OAK',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  redtiger: {
    id: 'redtiger',
    name: 'Red Tiger',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  playngo: {
    id: 'playngo',
    name: 'Play’n GO',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  octoplay: {
    id: 'octoplay',
    name: 'Octoplay',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  peterandsons: {
    id: 'peterandsons',
    name: 'Peter & Sons',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  shady: {
    id: 'shady',
    name: 'Shady',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  shuffle: {
    id: 'shuffle',
    name: 'Shuffle',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  twist: {
    id: 'twist',
    name: 'Twist',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  popiplay: {
    id: 'popiplay',
    name: 'Popiplay',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  helio: {
    id: 'helio',
    name: 'Helio',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  samurai: {
    id: 'samurai',
    name: 'Samurai',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  clawbuster: {
    id: 'clawbuster',
    name: 'Claw Buster',
    sessionFields: ['token', 'playUrl'],
    betLevelsSource: 'sessionConfig',
    betDisplayDivisorSlots: ['clawbuster-3-claws-of-leprechaun-gold-hold-and-win'],
    betDisplayDivisor: 100,
  },
  bgaming: {
    id: 'bgaming',
    name: 'BGaming',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  gamomat: {
    id: 'gamomat',
    name: 'Gamomat',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  justslots: {
    id: 'justslots',
    name: 'Just Slots',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  massive: {
    id: 'massive',
    name: 'Massive Studios',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  onetouch: {
    id: 'onetouch',
    name: 'One Touch',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  truelab: {
    id: 'truelab',
    name: 'True Lab',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  slotmill: {
    id: 'slotmill',
    name: 'Slotmill',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  gamesglobal: {
    id: 'gamesglobal',
    name: 'Games Global',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  jaderabbit: {
    id: 'jaderabbit',
    name: 'Jade Rabbit',
    sessionFields: ['token', 'gameId', 'host'],
    betLevelsSource: 'sessionConfig',
  },
  'fat-panda': {
    id: 'fat-panda',
    name: 'Fat Panda alias',
    aliasOf: 'pragmatic',
  },
  'hacksaw-gaming': {
    id: 'hacksaw-gaming',
    name: 'Hacksaw Gaming alias',
    aliasOf: 'hacksaw',
  },
  'hacksaw-openrgs': {
    id: 'hacksaw-openrgs',
    name: 'Hacksaw OpenRGS alias',
    aliasOf: 'hacksaw',
  },
  'backseat-gaming': {
    id: 'backseat-gaming',
    name: 'Backseat Gaming alias',
    aliasOf: 'hacksaw',
  },
  backseatgaming: {
    id: 'backseatgaming',
    name: 'Backseat Gaming alias',
    aliasOf: 'hacksaw',
  },
  'bullshark-games': {
    id: 'bullshark-games',
    name: 'Bullshark Games alias',
    aliasOf: 'hacksaw',
  },
  bullsharkgames: {
    id: 'bullsharkgames',
    name: 'Bullshark Games alias',
    aliasOf: 'hacksaw',
  },
  'games-global': {
    id: 'games-global',
    name: 'Games Global alias',
    aliasOf: 'gamesglobal',
  },
  'jade-rabbit': {
    id: 'jade-rabbit',
    name: 'Jade Rabbit alias',
    aliasOf: 'jaderabbit',
  },
  'penguin-king': {
    id: 'penguin-king',
    name: 'Penguin King',
    aliasOf: 'octoplay',
  },
  'titan-gaming': {
    id: 'titan-gaming',
    name: 'Titan Gaming',
    aliasOf: 'twist',
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Valkyrie',
    aliasOf: 'twist',
  },
  'print-studios': {
    id: 'print-studios',
    name: 'Print Studios',
    aliasOf: 'relax',
  },
  printstudios: {
    id: 'printstudios',
    name: 'Print Studios alias',
    aliasOf: 'relax',
  },
  petersons: {
    id: 'petersons',
    name: 'Peter & Sons',
    aliasOf: 'peterandsons',
  },
  'peter-sons': {
    id: 'peter-sons',
    name: 'Peter & Sons',
    aliasOf: 'peterandsons',
  },
  'one-touch': {
    id: 'one-touch',
    name: 'One Touch alias',
    aliasOf: 'onetouch',
  },
  'one-touch-games': {
    id: 'one-touch-games',
    name: 'One Touch Games alias',
    aliasOf: 'onetouch',
  },
  'play-n-go': {
    id: 'play-n-go',
    name: 'Play’n GO alias',
    aliasOf: 'playngo',
  },
  'red-tiger-gaming': {
    id: 'red-tiger-gaming',
    name: 'Red Tiger alias',
    aliasOf: 'redtiger',
  },
  'no-limit-city': {
    id: 'no-limit-city',
    name: 'NoLimit City alias',
    aliasOf: 'nolimit',
  },
  'no-limit': {
    id: 'no-limit',
    name: 'NoLimit alias',
    aliasOf: 'nolimit',
  },
  nlc: {
    id: 'nlc',
    name: 'NoLimit City alias',
    aliasOf: 'nolimit',
  },
  // aliases
  rt: { id: 'rt', name: 'Red Tiger alias', aliasOf: 'redtiger' },
  png: { id: 'png', name: 'Play’n GO alias', aliasOf: 'playngo' },
  octo: { id: 'octo', name: 'Octoplay alias', aliasOf: 'octoplay' },
  peter: { id: 'peter', name: 'Peter & Sons alias', aliasOf: 'peterandsons' },
  netentws: { id: 'netentws', name: 'NetEnt WS alias', aliasOf: 'netent' },
  tl: { id: 'tl', name: '1000 Lakes alias', aliasOf: 'stakeEngine' },
  stc: { id: 'stc', name: 'Stake Engine alias', aliasOf: 'stakeEngine' },
  popi: { id: 'popi', name: 'Popiplay alias', aliasOf: 'popiplay' },
}

/** Prüft ob Provider denselben Slot in verschiedenen Währungen parallel erlaubt */
export function supportsMultiCurrencySameSlot(providerId) {
  const p = PROVIDERS[providerId] || {}
  const base = p.aliasOf ? (PROVIDERS[p.aliasOf] || {}) : p
  return base.supportsMultiCurrencySameSlot !== false
}

export function getProviderCapabilities(providerId) {
  const p = PROVIDERS[providerId] || {}
  const base = p.aliasOf ? (PROVIDERS[p.aliasOf] || {}) : p
  return {
    ...DEFAULT_PROVIDER_CAPABILITIES,
    ...base,
  }
}
