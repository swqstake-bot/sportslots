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

  it('computes multiplier when events awa is in minor (Truelab wrapResponse contract)', () => {
    const betMinor = 50_000_000 // 0.5 SOL @ Stake 1e8 minor
    const winMinor = 250_000_000 // 5×
    const response = createResponse({
      round: {
        roundId: 'truelab-round-1',
        events: [{ awa: winMinor }],
      },
    })
    const result = parseBetResponse(response, betMinor)
    expect(result.winAmount).toBe(winMinor)
    expect(result.multiplier).toBeCloseTo(5, 5)
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

  describe('Stake Engine book events (Hushbough / Swaq Studios)', () => {
    const board = [['seed', 'fern', 'forest_gate', 'pebble'], ['berry', 'forest_gate', 'seed', 'fern'], ['seed', 'fern', 'berry', 'pebble'], ['fern', 'seed', 'pebble', 'berry'], ['forest_gate', 'seed', 'fern', 'pebble']]
    const stakeEngineResponse = (state) =>
      createResponse({
        round: { state, payoutMultiplier: 0, active: false, events: [{ awa: 0 }] },
        _stakeEngine: { raw: { round: { state } }, winMinor: 0 },
      })

    it('detects scatterTrigger + freeSpinsStart as bonus with scatter count', () => {
      const state = [
        { index: 0, type: 'reveal', spinId: 0, spinType: 'base', freeSpinNumber: 0, board },
        { index: 1, type: 'evalA', spinId: 0, wins: [] },
        { index: 2, type: 'lineWinsFinal', spinId: 0, wins: [], rawWin: 0, creditedWin: 0, totalWin: 0 },
        { index: 3, type: 'setWin', spinId: 0, amount: 0 },
        { index: 4, type: 'setTotalWin', spinId: 0, amount: 0 },
        { index: 5, type: 'scatterTrigger', spinId: 0, positions: [[0, 2], [1, 1], [4, 0]], count: 3, spins: 8, isRetrigger: false },
        { index: 6, type: 'freeSpinsStart', source: 'scatter', spins: 8, spinsLeft: 8, totalSpins: 8, webFactor: 1, charge: 'still' },
        { index: 7, type: 'reveal', spinId: 1, spinType: 'free', freeSpinNumber: 1, spinsLeft: 7, totalSpins: 8, board },
        { index: 8, type: 'freeSpinsEnd', playedSpins: 8, totalSpins: 8, cancelledSpins: 0, retriggerCount: 0, bonusWin: 1200, totalWin: 1200 },
        { index: 9, type: 'finalWin', amount: 1200, mode: 'base', cost: 1, tier: 1, name: null },
      ]
      const result = parseBetResponse(stakeEngineResponse(state), 100)
      expect(result.isBonus).toBe(true)
      expect(result.shouldStopOnBonus).toBe(true)
      expect(result.scatterCount).toBe(3)
    })

    it('detects a 5-gate bonus (freeSpinsStart with bonus name) and reports 5 scatters', () => {
      const state = [
        { index: 0, type: 'reveal', spinId: 0, spinType: 'base', freeSpinNumber: 0, board },
        { index: 1, type: 'scatterTrigger', spinId: 0, positions: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 0]], count: 5, spins: 10, isRetrigger: false, bonus: 'hushweave', goldenGate: [4, 0] },
        { index: 2, type: 'freeSpinsStart', source: 'scatter', spins: 10, spinsLeft: 10, totalSpins: 10, bonus: 'hushweave', charge: 'storm' },
        { index: 3, type: 'finalWin', amount: 30000, mode: 'base', cost: 1, tier: 3, name: 'moonweave' },
      ]
      const result = parseBetResponse(stakeEngineResponse(state), 100)
      expect(result.isBonus).toBe(true)
      expect(result.scatterCount).toBe(5)
    })

    it('does not flag a plain Hushbough base spin as bonus', () => {
      const state = [
        { index: 0, type: 'spell', spinId: 0, kind: 'lantern', multiplier: 2 },
        { index: 1, type: 'reveal', spinId: 0, spinType: 'base', freeSpinNumber: 0, spinsLeft: 0, totalSpins: 0, webFactor: 1, reelSet: 'base', board },
        { index: 2, type: 'evalA', spinId: 0, wins: [] },
        { index: 3, type: 'threadPull', spinId: 0, stage: 1, columns: [2], direction: 'down', distance: 1, board, threadFactor: 2, webFactor: 1, spellFactor: 2, factor: 4, isCrossThread: false },
        { index: 4, type: 'evalB', spinId: 0, stage: 1, wins: [], factor: 4, improvedLines: [] },
        { index: 5, type: 'lineWinsFinal', spinId: 0, wins: [], rawWin: 0, creditedWin: 0, totalWin: 0 },
        { index: 6, type: 'setWin', spinId: 0, amount: 0 },
        { index: 7, type: 'setTotalWin', spinId: 0, amount: 0 },
        { index: 8, type: 'finalWin', amount: 0, mode: 'base', cost: 1, tier: 0, name: null },
      ]
      const result = parseBetResponse(stakeEngineResponse(state), 100)
      expect(result.isBonus).toBe(false)
      expect(result.shouldStopOnBonus).toBe(false)
    })
  })
})
