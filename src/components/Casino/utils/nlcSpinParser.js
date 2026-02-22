export function parseNlcSpin(raw) {
  if (!raw || typeof raw !== 'object') return null

  const win = Number(raw.win ?? raw.spinWin ?? 0)
  const freespinsLeft = Number(raw.freespinsLeft ?? raw.remainingFreeSpins ?? 0)
  const mode = String(raw.mode ?? 'NORMAL').toUpperCase()
  const isBonus = mode !== 'NORMAL' || raw.wasFeatureBuy || raw.fsRoundWin > 0

  return {
    win,
    freespinsLeft,
    mode,
    isBonus,
    raw,
  }
}