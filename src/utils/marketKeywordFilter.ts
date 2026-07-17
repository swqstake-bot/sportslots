/** Strip accents for fuzzy DE/EN matching (über → uber). */
export function normalizeMatchText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** Comma-separated keywords → normalized tokens. */
export function parseMarketKeywords(raw: string | undefined | null): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => normalizeMatchText(s.trim()))
    .filter(Boolean)
}

export function marketKeywordHaystack(
  parts: Array<string | null | undefined>
): string {
  return normalizeMatchText(parts.filter(Boolean).join(' '))
}

/**
 * Include: empty = allow all (that pass exclude). Non-empty = at least one keyword must match.
 * Exclude: any match rejects.
 */
export function passesMarketKeywordFilter(
  haystack: string,
  includeKeywords: string[],
  excludeKeywords: string[]
): boolean {
  const hay = normalizeMatchText(haystack)
  if (excludeKeywords.some((k) => hay.includes(k))) return false
  if (includeKeywords.length === 0) return true
  return includeKeywords.some((k) => hay.includes(k))
}

/** Common MMA player-prop patterns (Stake market names). */
export const MMA_MARKET_TYPE_PRESETS = [
  { id: 'total_strikes_landed', label: 'Total strikes landed', keyword: 'total strikes landed' },
  { id: 'head_strikes_landed', label: 'Head strikes landed', keyword: 'head strikes landed' },
  { id: 'head_strikes_attempted', label: 'Head strikes attempted', keyword: 'head strikes attempted' },
  { id: 'body_strikes_landed', label: 'Body strikes landed', keyword: 'body strikes landed' },
  { id: 'significant_strikes', label: 'Significant strikes', keyword: 'significant strikes' },
  { id: 'takedowns', label: 'Takedowns', keyword: 'takedown' },
] as const

export function detectMmaMarketTypesFromNames(marketNames: string[]): typeof MMA_MARKET_TYPE_PRESETS[number][] {
  const hay = marketNames.map((n) => n.toLowerCase())
  return MMA_MARKET_TYPE_PRESETS.filter((preset) =>
    hay.some((name) => name.includes(preset.keyword))
  )
}

export function toggleExcludeKeyword(
  currentExcludeRaw: string,
  keyword: string,
  enabled: boolean
): string {
  const kw = normalizeMatchText(keyword.trim())
  if (!kw) return currentExcludeRaw
  const parts = parseMarketKeywords(currentExcludeRaw)
  const has = parts.includes(kw)
  let next = parts
  if (enabled && has) {
    next = parts.filter((p) => p !== kw)
  } else if (!enabled && !has) {
    next = [...parts, kw]
  }
  return next.join(', ')
}
