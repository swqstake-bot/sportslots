/** Zählt gezogene Keno-Zahlen über Preroll-Runden (1–39). */

const KENO_MAX = 39

export interface KenoHeatmapTracker {
  recordDrawn: (drawn: number[]) => void
  getHotPicks: (count: number) => number[]
  reset: () => void
  snapshot: () => Record<number, number>
}

export function createKenoHeatmapTracker(maxNumber = KENO_MAX): KenoHeatmapTracker {
  const cap = Math.max(1, Math.min(KENO_MAX, Math.floor(maxNumber)))
  const counts = new Map<number, number>()

  const recordDrawn = (drawn: number[]) => {
    if (!Array.isArray(drawn)) return
    for (const raw of drawn) {
      const n = Math.floor(Number(raw))
      if (!Number.isFinite(n) || n < 1 || n > cap) continue
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }

  const getHotPicks = (count: number) => {
    const want = Math.max(1, Math.min(10, Math.floor(count)))
    const ranked = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0] - b[0]
    })
    const out: number[] = []
    for (const [n] of ranked) {
      if (out.length >= want) break
      out.push(n)
    }
    while (out.length < want) {
      for (let n = 1; n <= cap && out.length < want; n++) {
        if (!out.includes(n)) out.push(n)
      }
      if (out.length < want) break
    }
    return out.sort((a, b) => a - b)
  }

  return {
    recordDrawn,
    getHotPicks,
    reset: () => counts.clear(),
    snapshot: () => {
      const snap: Record<number, number> = {}
      for (const [n, c] of counts) snap[n] = c
      return snap
    },
  }
}

export function pickRandomKenoNumbers(count: number, maxNumber = KENO_MAX): number[] {
  const cap = Math.max(1, Math.min(KENO_MAX, Math.floor(maxNumber)))
  const want = Math.max(1, Math.min(10, Math.floor(count)))
  const pool = Array.from({ length: cap }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, want).sort((a, b) => a - b)
}
