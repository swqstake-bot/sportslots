/** Stake Plinko payout slots per rows × risk (from reference SSP). */



export type PlinkoRiskKey = 'low' | 'medium' | 'high' | 'expert'



export const PLINKO_MULTIPLIERS: Record<number, Record<PlinkoRiskKey, number[]>> = {

  8: {

    low: [0.5, 1, 1.1, 2.1, 5.6],

    medium: [0.4, 0.7, 1.3, 3, 13],

    high: [0.2, 0.3, 1.5, 4, 29],

    expert: [0.1, 1.1, 4.6, 50],

  },

  9: {

    low: [0.7, 1, 1.6, 2, 5.6],

    medium: [0.5, 0.9, 1.7, 4, 18],

    high: [0.2, 0.6, 2, 7, 43],

    expert: [0.1, 0.2, 1.5, 7.8, 100],

  },

  10: {

    low: [0.5, 1, 1.1, 1.4, 3, 8.9],

    medium: [0.4, 0.6, 1.4, 2, 5, 22],

    high: [0.2, 0.3, 0.9, 3, 10, 76],

    expert: [0.1, 0.6, 2, 11, 201],

  },

  11: {

    low: [0.7, 1, 1.3, 1.9, 3, 8.4],

    medium: [0.5, 0.7, 1.8, 3, 6, 24],

    high: [0.2, 0.4, 1.4, 5.2, 14, 120],

    expert: [0.1, 0.2, 1.1, 4, 16, 324],

  },

  12: {

    low: [0.5, 1, 1.1, 1.4, 1.6, 3, 10],

    medium: [0.3, 0.6, 1.1, 2, 4, 11, 33],

    high: [0.2, 0.7, 2, 8.1, 24, 170],

    expert: [0.1, 0.4, 1.5, 6, 30, 619],

  },

  13: {

    low: [0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],

    medium: [0.4, 0.7, 1.3, 3, 6, 13, 43],

    high: [0.2, 1, 4, 11, 37, 260],

    expert: [0.1, 0.6, 3, 10, 52, 1000],

  },

  14: {

    low: [0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],

    medium: [0.2, 0.5, 1, 1.9, 4, 7, 15, 58],

    high: [0.2, 0.3, 1.9, 5, 18, 56, 420],

    expert: [0.1, 0.2, 1.2, 3, 16, 80, 2300],

  },

  15: {

    low: [0.7, 1, 1.1, 1.5, 2, 3, 8, 15],

    medium: [0.3, 0.5, 1.3, 3, 5, 11, 18, 88],

    high: [0.2, 0.5, 3, 8, 27, 83, 620],

    expert: [0.1, 0.2, 1.8, 6, 23, 125, 5000],

  },

  16: {

    low: [0.5, 1, 1.1, 1.2, 1.4, 2, 9, 16],

    medium: [0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],

    high: [0.2, 2, 4, 9, 26, 130, 1000],

    expert: [0.1, 1.1, 2.5, 7, 26, 216, 10000],

  },

}



export const PLINKO_ALL_TARGETS = Array.from(

  new Set(

    Object.values(PLINKO_MULTIPLIERS)

      .flatMap((risks) => Object.values(risks))

      .flat()

  )

).sort((a, b) => b - a)



export function plinkoMultipliersFor(rows: number, risk: PlinkoRiskKey): number[] {

  const row = PLINKO_MULTIPLIERS[rows]

  if (!row) return []

  return [...(row[risk] ?? [])]

}



export function findPlinkoConfigForTarget(target: number): { rows: number; risk: PlinkoRiskKey } | null {

  for (const [rowsStr, risks] of Object.entries(PLINKO_MULTIPLIERS)) {

    const rows = Number(rowsStr)

    for (const [risk, multis] of Object.entries(risks) as [PlinkoRiskKey, number[]][]) {

      if (multis.includes(target)) return { rows, risk }

    }

  }

  return null

}


