/**
 * Stake third-party session helpers (currency + light slug hyphen variants).
 * Do NOT rewrite studio prefixes into other games (Fat Panda ≠ 777 Rush).
 */

/** Normalize wallet codes to Stake CurrencyEnum for EU GoldCoins. */
export function normalizeStakeSessionCurrency(code) {
  const c = String(code || '').toLowerCase().trim()
  if (c === 'gc' || c === 'xgc') return 'gold'
  if (c === 'sc' || c === 'xsc' || c === 'xswp') return 'sweeps'
  return c
}

/**
 * Only hyphenation variants of the SAME slug — never swap provider prefixes
 * (e.g. do not turn fatpanda-777-rush into pragmatic-play-777-rush; that invents another game).
 * Fat Panda (pragmatic-play-fat-panda) is a different title from 777 Rush.
 */
export function stakeThirdPartySlugCandidates(slug) {
  const raw = String(slug || '').trim()
  if (!raw) return []
  const s = raw.toLowerCase()
  const out = []
  const push = (v) => {
    const x = String(v || '').trim()
    if (!x) return
    if (!out.some((e) => e.toLowerCase() === x.toLowerCase())) out.push(x)
  }
  push(raw)

  // Same slug, optional hyphen after "fat" / "sexy"
  if (s.startsWith('fatpanda-')) push(`fat-panda-${s.slice('fatpanda-'.length)}`)
  if (s.startsWith('fat-panda-')) push(`fatpanda-${s.slice('fat-panda-'.length)}`)
  if (s.startsWith('sexyrabbit-')) push(`sexy-rabbit-${s.slice('sexyrabbit-'.length)}`)
  if (s.startsWith('sexy-rabbit-')) push(`sexyrabbit-${s.slice('sexy-rabbit-'.length)}`)

  return out
}

export function isStakeGameUnavailableError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('type.game cannot be found') ||
    msg.includes('game cannot be found') ||
    (msg.includes('unavailable') && msg.includes('game'))
  )
}

/** Normalize a display name for fuzzy slot matching. */
export function normalizeSlotNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
