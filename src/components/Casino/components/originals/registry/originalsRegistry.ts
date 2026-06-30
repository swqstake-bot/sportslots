/**

 * Stake Originals registry — apiReady/uiReady flags for phased rollout.

 */



export type OriginalsGameSlug =

  | 'dice'

  | 'limbo'

  | 'mines'

  | 'plinko'

  | 'keno'

  | 'snakes'

  | 'dragon-tower'

  | 'pump'

  | 'diamonds'

  | 'flip'

  | 'hilo'

  | 'packs'

  | 'rock-paper-scissors'

  | 'slots-scarab'

  | 'darts'

  | 'cases'

  | 'wheel'

  | 'bars'

  | 'chicken'

  | 'tarot'

  | 'slots-samurai'

  | 'tome-of-life'

  | 'roulette'

  | 'baccarat'

  | 'blackjack'

  | 'video-poker'

  | 'drill'

  | 'moles'

  | 'blitz'



export interface OriginalsGameEntry {

  slug: OriginalsGameSlug | string

  name: string

  thumbnailUrl: string

  apiReady: boolean

  uiReady: boolean

  supportsCombo: boolean

  supportsAsync: boolean

  supportsManual: boolean

  rolloutPhase: 'A' | 'B' | 'C'

  /** When apiReady is false: why the bet path is not wired yet */

  blockedReason?: string

}



const IMG = 'https://mediumrare.imgix.net'



const NO_API =

  'No verified Stake GraphQL/REST bet path in reference handlers — capture Network tab on stake.com'



export const ORIGINALS_REGISTRY: OriginalsGameEntry[] = [

  { slug: 'dice', name: 'Dice', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: true, uiReady: true, supportsCombo: true, supportsAsync: true, supportsManual: true, rolloutPhase: 'A' },

  { slug: 'limbo', name: 'Limbo', thumbnailUrl: `${IMG}/11caec5df20098884ae9071848e1951b8b34e5ec84a7241f2e7c5afd4b323dfd`, apiReady: true, uiReady: true, supportsCombo: true, supportsAsync: true, supportsManual: true, rolloutPhase: 'A' },

  { slug: 'mines', name: 'Mines', thumbnailUrl: `${IMG}/15a51a2ae2895872ae2b600fa6fe8d7f8d32c9814766b66ddea2b288d04ba89c`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: false, rolloutPhase: 'A' },

  { slug: 'plinko', name: 'Plinko', thumbnailUrl: `${IMG}/5cbb2498c956527e6584c6af216489b85bbb7a909c7d3c4e131a3be9bd1cc6bf`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'A' },

  { slug: 'keno', name: 'Keno', thumbnailUrl: `${IMG}/102cf3d7c840018b939cd787bf013e080b996d80e604f3008f21dddf1f1aa201`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'A' },

  { slug: 'snakes', name: 'Snakes', thumbnailUrl: `${IMG}/7c53d6414e9be4cf73ce95ecf193b2ae129a525cbc0231577b74150b24ca434f`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'A' },

  { slug: 'pump', name: 'Pump', thumbnailUrl: `${IMG}/bfd2cbc0217a6350c164511ecc4a0d965b94f9e648536cab32c89e50a3c6204a`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'hilo', name: 'Hilo', thumbnailUrl: `${IMG}/7324297ac3a60dd5705db514330c5c363aca538432fda98be261bef8df232a77`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'dragon-tower', name: 'Dragon Tower', thumbnailUrl: `${IMG}/2c3e16f0a3b8cd8d979265e48dd6a169937a4a4d0acb05ad532ca8345a1e6f21`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'diamonds', name: 'Diamonds', thumbnailUrl: `${IMG}/59d1df22a2931a965fc241a436a398f460e71ea9d0214f66780a52b56655d392`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'flip', name: 'Flip', thumbnailUrl: `${IMG}/1c0de2ee0ce713086ff7735697ad2b5385bc974f206b857c724a5ec84467a73b`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'wheel', name: 'Wheel', thumbnailUrl: `${IMG}/e0a4131a16c28a1c1516958c93ec90c6f0f1bb00f41de87f72f6800c535b9c6f`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'darts', name: 'Darts', thumbnailUrl: `${IMG}/9cd0814e4ef63607a99044eab83cc981e1df7398032041d8c8505f33796d50d1`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'bars', name: 'Bars', thumbnailUrl: `${IMG}/88cf822054a51e5e79e73db80269740ef9023569f1552e7f65a471897808c397`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'chicken', name: 'Chicken', thumbnailUrl: `${IMG}/a91aa468f459264d55fb9e2706c3684782cc5ecf716892c187122c611acf2773`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'tarot', name: 'Tarot', thumbnailUrl: `${IMG}/4db9bee5db762c288bc49e4cd96f492180966be040e3dc4dc27f825a37fd687f`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'cases', name: 'Cases', thumbnailUrl: `${IMG}/5da127925ac99a19da0cd888e5436049bc42f8ee4002df80cdc817f0501ab8a7`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'packs', name: 'Packs', thumbnailUrl: `${IMG}/f403357fdc65f2f81f6da97ed79b39a16804e5f583cd36c536c1ff37c6a7fb39`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'rock-paper-scissors', name: 'Rock Paper Scissors', thumbnailUrl: `${IMG}/aaf077ae8ccb395eda1df95d6e50e8a2f20f6e3b1600972d11e681be2e7dacaf`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'B' },

  { slug: 'slots-samurai', name: 'Blue Samurai', thumbnailUrl: `${IMG}/3a6fa5d49d31f11ce131acb64d8cbbe6cc5d8f916bd0afacaeb1fc5976aa4fdf`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'C' },

  { slug: 'slots-scarab', name: 'Scarab Spin', thumbnailUrl: `${IMG}/7a2cc695cad10b097220f0c5c81858075c3ec4ee4235d8211cbbdbbd389c6d6c`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'C' },

  { slug: 'tome-of-life', name: 'Tome of Life', thumbnailUrl: `${IMG}/931cf1fd7147d0d0deda93f16fb8ef556d6d42df3586214f6539a9cfcfcf57b9`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'C' },

  { slug: 'blackjack', name: 'Blackjack', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: true, uiReady: true, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'C' },

  { slug: 'roulette', name: 'Roulette', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

  { slug: 'baccarat', name: 'Baccarat', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

  { slug: 'video-poker', name: 'Video Poker', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: false, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

  { slug: 'drill', name: 'Drill', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

  { slug: 'moles', name: 'Moles', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

  { slug: 'blitz', name: 'Blitz', thumbnailUrl: `${IMG}/30688668d7d2d48d472edd0f1e2bca0758e7ec51cbab8c04d8b7f157848640e0`, apiReady: false, uiReady: false, supportsCombo: false, supportsAsync: true, supportsManual: true, rolloutPhase: 'C', blockedReason: NO_API },

]



export function getOriginalsGame(slug: string): OriginalsGameEntry | undefined {

  return ORIGINALS_REGISTRY.find((g) => g.slug === slug)

}



export function getPlayableGames(): OriginalsGameEntry[] {

  return ORIGINALS_REGISTRY.filter((g) => g.apiReady && g.uiReady)

}



export const DEFAULT_ORIGINALS_GAME = 'dice'


