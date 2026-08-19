export function emitCasinoBetAdded(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('casino-bet-added', { detail }))
  } catch {
    /* ignore */
  }
}
