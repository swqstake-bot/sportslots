import type { OriginalsProfileV2, OriginalsWorkbenchOptions } from './schema/workbenchOptions'

const KEY = 'originalsWorkbenchProfiles'

export function loadProfiles(): OriginalsProfileV2[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OriginalsProfileV2[]) : []
  } catch {
    return []
  }
}

export function saveProfiles(profiles: OriginalsProfileV2[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles))
  } catch {
    /* ignore */
  }
}

export function upsertProfile(profile: OriginalsProfileV2): OriginalsProfileV2[] {
  const list = loadProfiles()
  const idx = list.findIndex((p) => p.name === profile.name)
  const next = [...list]
  if (idx >= 0) next[idx] = profile
  else next.push(profile)
  saveProfiles(next)
  return next
}

export function deleteProfile(name: string): OriginalsProfileV2[] {
  const next = loadProfiles().filter((p) => p.name !== name)
  saveProfiles(next)
  return next
}

export function exportProfileJson(profile: OriginalsProfileV2): string {
  return JSON.stringify(profile, null, 2)
}

export function importOriginalsProfileJson(text: string): OriginalsProfileV2 {
  const parsed = JSON.parse(text) as Record<string, unknown>
  if (parsed.options && typeof parsed.options === 'object') {
    return {
      name: String(parsed.name || 'Imported'),
      options: parsed.options as OriginalsWorkbenchOptions,
      notes: parsed.notes != null ? String(parsed.notes) : undefined,
      favorite: Boolean(parsed.favorite),
      loadOnStart: Boolean(parsed.loadOnStart),
    }
  }
  // Reference flat profile shape (game + bet fields at root)
  if (parsed.game || parsed.initialBetSize != null || parsed.betSize != null) {
    const { name, favorite, loadOnStart, notes, ...opts } = parsed
    return {
      name: String(name || 'Imported'),
      options: opts as OriginalsWorkbenchOptions,
      favorite: Boolean(favorite),
      loadOnStart: Boolean(loadOnStart),
      notes: notes != null ? String(notes) : undefined,
    }
  }
  return {
    name: 'Imported',
    options: parsed as OriginalsWorkbenchOptions,
  }
}
