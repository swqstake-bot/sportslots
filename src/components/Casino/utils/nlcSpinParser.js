function pick(obj, keys, depth = 0) {
  if (!obj || depth > 6) return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const v = pick(item, keys, depth + 1)
      if (v != null) return v
    }
    return null
  }
  if (typeof obj !== 'object') return null
  const lower = Object.keys(obj).reduce((acc, k) => {
    acc[k.toLowerCase()] = obj[k]
    return acc
  }, {})
  for (const key of keys) {
    const v = lower[key.toLowerCase()]
    if (v != null) return v
  }
  for (const v of Object.values(obj)) {
    const nested = pick(v, keys, depth + 1)
    if (nested != null) return nested
  }
  return null
}

export function parseNlcSpin(raw) {
  if (!raw || typeof raw !== 'object') return null

  const win = Number(pick(raw, ['win', 'winamount', 'spinwin', 'totalwin']) ?? 0)
  const freespinsLeft = Number(pick(raw, ['freespinsleft', 'remainingfreespins', 'freespinleft']) ?? 0)
  const mode = String(pick(raw, ['mode', 'gamemode']) ?? 'NORMAL').toUpperCase()
  const fsRoundWin = Number(pick(raw, ['fsroundwin', 'freespinwin']) ?? 0)
  const wasFeatureBuy = Boolean(pick(raw, ['wasfeaturebuy', 'featurebuy', 'bonusbuy']) ?? false)
  const isBonus = mode !== 'NORMAL' || wasFeatureBuy || fsRoundWin > 0

  return {
    win,
    freespinsLeft,
    mode,
    isBonus,
    raw,
  }
}