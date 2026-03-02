import { describe, it, expect } from 'vitest'
import { parseBetResponse } from './parseBetResponse'

// Helper to create mock responses
const createResponse = (overrides = {}) => ({
  statusCode: 0,
  accountBalance: { balance: 1000, currencyCode: 'EUR' },
  round: {
    roundId: 'test-round-1',
    status: 'complete',
    events: [],
    ...overrides.round
  },
  ...overrides
})

describe('parseBetResponse', () => {
  it('should detect normal win', () => {
    const response = createResponse({
      round: {
        winAmountDisplay: 500, // 5.00 EUR
        events: []
      }
    })
    const result = parseBetResponse(response, 100)
    expect(result.success).toBe(true)
    expect(result.winAmount).toBe(500)
    expect(result.isBonus).toBe(false)
  })

  it('should detect Hacksaw Bonus with Scatter Count (Gridwin method)', () => {
    const response = createResponse({
      round: {
        events: [
          {
            c: {
              bonusFeatureWon: 'fs_1',
              actions: [
                { at: 'gridwin', data: { winAmount: 0, count: '3' } } // 3 Scatter trigger
              ]
            }
          }
        ]
      }
    })
    const result = parseBetResponse(response, 100)
    expect(result.isBonus).toBe(true)
    expect(result.bonusFeatureId).toBe('fs_1')
    expect(result.scatterCount).toBe(3)
    expect(result.shouldStopOnBonus).toBe(true)
  })

  it('should extract ID suffix as scatter count fallback', () => {
    const response = createResponse({
      round: {
        events: [
          {
            c: {
              bonusFeatureWon: 'fs_5', // Should be 5 scatter
              actions: []
            }
          }
        ]
      }
    })
    const result = parseBetResponse(response, 100)
    expect(result.isBonus).toBe(true)
    expect(result.bonusFeatureId).toBe('fs_5')
    expect(result.scatterCount).toBe(5)
  })

  it('should NOT detect mini-features as bonus stop', () => {
    const response = createResponse({
      round: {
        events: [
          {
            c: {
              bonusFeatureWon: 'activator', // Mini-feature
              actions: []
            }
          }
        ]
      }
    })
    const result = parseBetResponse(response, 100)
    expect(result.shouldStopOnBonus).toBe(false)
  })

  it('should detect Promotion Win as Bonus', () => {
    const response = createResponse({
      promotionWin: { amount: 1000 }
    })
    const result = parseBetResponse(response, 100)
    expect(result.isBonus).toBe(true)
    expect(result.shouldStopOnBonus).toBe(true)
  })

  it('should ignore WIN AMOUNT from Bonus Spins that are instantly included (2 Wild 2 Die Bug)', () => {
    // Simulierte Response aus dem User-Log (seq 462)
    const response = createResponse({
      round: {
        events: [
          {
            etn: 'reveal', // Basis-Spiel
            awa: '1100', // Basis-Gewinn
            c: {
              actions: [
                { at: 'gridwin', data: { winAmount: '1100' } }, // Linie
                { at: 'bonusfeaturewon', data: { bfw: 'fs_2', bfc: '3' } } // Bonus Trigger
              ]
            }
          },
          {
            etn: 'feature_enter', // Bonus Start
            awa: '1100',
            c: { bonusFeatureWon: 'fs_2' }
          },
          {
            etn: 'fs_2_reveal', // Bonus Spin 1 (Zukunft!)
            awa: '1100',
            c: { actions: [] }
          },
          {
            etn: 'fs_2_reveal', // Bonus Spin X (Zukunft!) -> Fetter Gewinn
            awa: '58300', // DAS SOLL NICHT GEZÄHLT WERDEN!
            c: { actions: [{ at: 'totalWin', data: { winAmount: '57200' } }] }
          }
        ]
      }
    })

    const result = parseBetResponse(response, 100)
    
    expect(result.isBonus).toBe(true)
    expect(result.shouldStopOnBonus).toBe(true)
    
    // WICHTIG: Der Gewinn darf NUR der Basis-Gewinn (1100) sein, NICHT der Bonus-Gesamtgewinn (58300)!
    expect(result.winAmount).toBe(1100) 
  })

  it('should detect Circle of Life Bonus via fsExpand', () => {
    const response = createResponse({
      round: {
        events: [
          {
            etn: 'reveal',
            c: {
              actions: [
                { at: 'fsExpand', data: { p: '1' } }, // Circle of Life Bonus Trigger
                { at: 'stick', data: {} }
              ]
            }
          },
          {
            etn: 'feature_enter',
            c: { bonusFeatureWon: 'fs', bonusFeatureCount: '13' }
          }
        ]
      }
    })
    const result = parseBetResponse(response, 100)
    expect(result.isBonus).toBe(true)
    expect(result.shouldStopOnBonus).toBe(true)
    expect(result.bonusFeatureId).toBe('fs')
  })

  it('should extract Hacksaw win from awa (minor units) and compute multiplier', () => {
    const response = createResponse({
      round: {
        events: [
          { etn: 'reveal', awa: '22000', c: { actions: [{ at: 'totalWin', data: { winAmount: '22000' } }] } }
        ]
      }
    })
    const result = parseBetResponse(response, 2200)
    expect(result.winAmount).toBe(22000)
    expect(result.multiplier).toBeCloseTo(10)
  })

  it('should detect Fire My Laser Bonus via bonusFeatureWon in collapse events', () => {
    const response = createResponse({
      round: {
        events: [
          { etn: 'reveal', c: { actions: [{ at: 'hit', data: {} }] } },
          { etn: 'collapse', c: { actions: [{ at: 'hit', data: {} }] } },
          { etn: 'collapse', c: { actions: [{ at: 'mult', data: { m: '4' } }, { at: 'totalWin', data: { winAmount: '9240' } }] } }
        ]
      }
    })
    
    // Ohne 'bonusFeatureWon' oder 'feature_enter' sollte isBonus FALSE sein.
    // Das bestätigt, dass wir den "Spinnt schnell weiter" Bug reproduziert haben,
    // wenn der Log keine Bonus-Indikatoren zeigt.
    const result = parseBetResponse(response, 100)
    expect(result.isBonus).toBe(false)
  })
})