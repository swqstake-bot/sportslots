/** Product branding — single source of truth for UI + Electron metadata. */
export const APP_NAME = 'swqbot'
export const APP_NAME_TITLE = 'swqbot'
export const APP_TAGLINE = 'Stake automation · slots, sports & originals'

/** Public assets (Vite `public/`) — use `./` in packaged Electron, not `/`. */
export function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './'
  const file = String(path || '').replace(/^\//, '')
  return `${base}${file}`
}

export const APP_FAVICON_URL = publicAssetUrl('favicon.svg')
export const APP_LOGO_URL = publicAssetUrl('logo.svg')

export const APP_VIEW_TITLES = {
  casino: 'slots',
  sports: 'sports',
  logger: 'logs',
} as const
