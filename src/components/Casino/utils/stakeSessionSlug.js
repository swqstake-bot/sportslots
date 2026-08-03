/**
 * Stake third-party session helpers (slug aliases + GoldCoin currency).
 */

/** Normalize wallet codes to Stake CurrencyEnum for EU GoldCoins. */
export function normalizeStakeSessionCurrency(code) {
  const c = String(code || '').toLowerCase().trim()
  if (c === 'gc' || c === 'xgc') return 'gold'
  if (c === 'sc' || c === 'xsc' || c === 'xswp') return 'sweeps'
  return c
}

/**
 * Alternate game slugs when Stake returns type.game cannot be found.
 * Fat Panda titles often appear as fatpanda-*, fat-panda-*, or pragmatic-play-*.
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

  if (s.startsWith('fatpanda-')) {
    const rest = s.slice('fatpanda-'.length)
    push(`fat-panda-${rest}`)
    push(`pragmatic-play-${rest}`)
  }
  if (s.startsWith('fat-panda-')) {
    const rest = s.slice('fat-panda-'.length)
    push(`fatpanda-${rest}`)
    push(`pragmatic-play-${rest}`)
  }
  if (s.startsWith('pragmatic-play-')) {
    const rest = s.slice('pragmatic-play-'.length)
    push(`fat-panda-${rest}`)
    push(`fatpanda-${rest}`)
  }
  // Compact sexyrabbit / videoslots style (already handled elsewhere, keep light aliases)
  if (s.startsWith('sexyrabbit-')) {
    push(`sexy-rabbit-${s.slice('sexyrabbit-'.length)}`)
  }
  if (s.startsWith('sexy-rabbit-')) {
    push(`sexyrabbit-${s.slice('sexy-rabbit-'.length)}`)
  }

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
