/** Fixed round multipliers per difficulty (SSP reference tables). */

type Diff = 'easy' | 'medium' | 'hard' | 'expert'

export const CHICKEN_MULTIPLIERS: Record<Diff, number[]> = {
  easy: [1.03, 1.09, 1.15, 1.23, 1.31, 1.4, 1.51, 1.63, 1.78, 1.96, 2.18, 2.45, 2.8, 3.27, 3.92, 4.9, 6.53, 9.8, 19.6],
  medium: [1.15, 1.37, 1.64, 2, 2.46, 3.07, 3.91, 5.08, 6.67, 9.31, 13.3, 19.95, 31.92, 55.86, 111.72, 279.3, 1117.2],
  hard: [1.31, 1.77, 2.46, 3.48, 5.06, 7.59, 11.81, 19.18, 32.89, 60.29, 120.59, 271.32, 723.52, 2532.32, 15193.92],
  expert: [1.96, 4.14, 9.31, 22.61, 60.29, 180.88, 633.08, 2743.35, 16460.08, 181060.88],
}

export const PUMP_MULTIPLIERS: Record<Diff, number[]> = {
  easy: [1.02, 1.07, 1.11, 1.17, 1.23, 1.29, 1.36, 1.44, 1.53, 1.63, 1.75, 1.88, 2.04, 2.23, 2.45, 2.72, 3.06, 3.5, 4.08, 4.9, 6.13, 8.17, 12.25, 24.5],
  medium: [1.11, 1.27, 1.46, 1.69, 1.98, 2.33, 2.76, 3.31, 4.03, 4.95, 6.19, 7.88, 10.25, 13.66, 18.78, 26.83, 40.25, 64.4, 112.7, 225.4, 563.5, 2254],
  hard: [1.23, 1.55, 1.98, 2.56, 3.36, 4.48, 6.08, 8.41, 11.92, 17.34, 26.01, 40.46, 65.74, 112.7, 206.62, 413.23, 929.77, 2479.4, 8677.9, 52067.4],
  expert: [1.63, 2.8, 4.95, 9.08, 17.34, 34.68, 73.21, 164.72, 400.02, 1066.73, 3200.18, 11200.65, 48536.13, 291216.8, 3203384.8],
}

export function roundMultiplierFor(game: 'chicken' | 'pump', difficulty: string, round: number): number | null {
  const d = (difficulty || 'medium').toLowerCase() as Diff
  const table = game === 'chicken' ? CHICKEN_MULTIPLIERS : PUMP_MULTIPLIERS
  const rows = table[d] ?? table.medium
  const idx = Math.max(1, Math.round(round)) - 1
  if (idx < 0 || idx >= rows.length) return null
  return rows[idx]
}

export function maxRoundsFor(game: 'chicken' | 'pump', difficulty: string): number {
  const d = (difficulty || 'medium').toLowerCase() as Diff
  const table = game === 'chicken' ? CHICKEN_MULTIPLIERS : PUMP_MULTIPLIERS
  return (table[d] ?? table.medium).length
}
