/** Leeres Feld bei 0 (Stop Loss/Profit); sonst Zahl als String */
export function usdLimitToInputStr(n) {
  if (!Number.isFinite(Number(n)) || Number(n) <= 0) return ''
  return String(Number(n))
}

export function parseUsdLimitInput(raw) {
  const s = String(raw ?? '').trim()
  if (s === '' || s === '.') return 0
  const v = parseFloat(s)
  return Number.isFinite(v) && v >= 0 ? v : 0
}

export function isUsdLimitInputCharsOk(s) {
  return s === '' || /^\d*\.?\d*$/.test(s)
}
