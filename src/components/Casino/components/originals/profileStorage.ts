import type { OriginalsProfileV2, OriginalsWorkbenchOptions } from './schema/workbenchOptions'

const KEY = 'originalsWorkbenchProfiles'

function normalizeGame(slug: string | undefined): string {
  return (slug || 'dice').toLowerCase().trim()
}

function profileGame(profile: OriginalsProfileV2): string {
  return normalizeGame(profile.options?.game)
}

function loadAllProfiles(): OriginalsProfileV2[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OriginalsProfileV2[]) : []
  } catch {
    return []
  }
}

/** Profiles saved for one game (mines, keno, dice, …). */
export function loadProfiles(gameSlug: string): OriginalsProfileV2[] {
  const game = normalizeGame(gameSlug)
  return loadAllProfiles().filter((p) => profileGame(p) === game)
}

export function saveProfiles(profiles: OriginalsProfileV2[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles))
  } catch {
    /* ignore */
  }
}

/** Replace all profiles for a single game, keeping other games untouched. */
export function saveProfilesForGame(gameSlug: string, profiles: OriginalsProfileV2[]): void {
  const game = normalizeGame(gameSlug)
  const others = loadAllProfiles().filter((p) => profileGame(p) !== game)
  const scoped = profiles.map((p) => ({
    ...p,
    options: { ...p.options, game } as OriginalsWorkbenchOptions,
  }))
  saveProfiles([...others, ...scoped])
}

export function upsertProfile(profile: OriginalsProfileV2, gameSlug: string): OriginalsProfileV2[] {
  const game = normalizeGame(gameSlug)
  const profileWithGame: OriginalsProfileV2 = {
    ...profile,
    options: { ...profile.options, game } as OriginalsWorkbenchOptions,
  }

  let next = loadAllProfiles()
  if (profileWithGame.lastUsed) {
    next = next.map((p) => (profileGame(p) === game ? { ...p, lastUsed: false } : p))
  }

  const idx = next.findIndex((p) => p.name === profile.name && profileGame(p) === game)
  if (idx >= 0) next[idx] = profileWithGame
  else next.push(profileWithGame)

  saveProfiles(next)
  return loadProfiles(game)
}

export function deleteProfile(name: string, gameSlug: string): OriginalsProfileV2[] {
  const game = normalizeGame(gameSlug)
  const next = loadAllProfiles().filter((p) => !(p.name === name && profileGame(p) === game))
  saveProfiles(next)
  return loadProfiles(game)
}

export function exportProfileJson(profile: OriginalsProfileV2): string {
  return JSON.stringify(profile, null, 2)
}

export function importOriginalsProfileJson(text: string, gameSlug?: string): OriginalsProfileV2 {
  const parsed = JSON.parse(text) as Record<string, unknown>
  const defaultGame = normalizeGame(gameSlug)
  if (parsed.options && typeof parsed.options === 'object') {
    const options = parsed.options as OriginalsWorkbenchOptions
    return {
      name: String(parsed.name || 'Imported'),
      options: { ...options, game: normalizeGame(options.game || defaultGame) },
      notes: parsed.notes != null ? String(parsed.notes) : undefined,
      favorite: Boolean(parsed.favorite),
      loadOnStart: Boolean(parsed.loadOnStart),
    }
  }
  // Reference flat profile shape (game + bet fields at root)
  if (parsed.game || parsed.initialBetSize != null || parsed.betSize != null) {
    const { name, favorite, loadOnStart, notes, game, ...opts } = parsed
    return {
      name: String(name || 'Imported'),
      options: { ...(opts as OriginalsWorkbenchOptions), game: normalizeGame(String(game || defaultGame)) },
      favorite: Boolean(favorite),
      loadOnStart: Boolean(loadOnStart),
      notes: notes != null ? String(notes) : undefined,
    }
  }
  return {
    name: 'Imported',
    options: { ...(parsed as OriginalsWorkbenchOptions), game: defaultGame },
  }
}
