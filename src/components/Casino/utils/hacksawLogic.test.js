import { describe, it, expect } from 'vitest'
import { shouldSkipBonus } from '../api/providers/hacksaw'

// Mock für parseBetResponse Ergebnis
function mockParsed({ isBonus = false, shouldStopOnBonus = false, bonusFeatureId = null, scatterCount = null }) {
  return { isBonus, shouldStopOnBonus, bonusFeatureId, scatterCount }
}

describe('Hacksaw skipContinue Logic', () => {
  it('should skip on general bonus if no minScatter defined', () => {
    const parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true })
    const options = { skipContinueOnBonus: true }
    expect(shouldSkipBonus(parsed, options)).toBe(true)
  })

  it('should NOT skip on general bonus if minScatter is defined but not met', () => {
    // 3 Scatter, Min 4 -> Soll weiterspielen (nicht skippen)
    const parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, scatterCount: 3 })
    const options = { skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(false)
  })

  it('should skip if scatter count meets minScatter', () => {
    // 4 Scatter, Min 4 -> Soll stoppen (skippen)
    const parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, scatterCount: 4 })
    const options = { skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(true)
  })

  it('should skip if scatter count exceeds minScatter', () => {
    // 5 Scatter, Min 4 -> Soll stoppen (skippen)
    const parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, scatterCount: 5 })
    const options = { skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(true)
  })

  it('should handle Octo Attack special cases correctly (using ID mapping)', () => {
    // Octo fs (Normal Bonus) with 6 Scatters -> Should NOT skip if Min 4 (because ID 'fs' = 3)
    let parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, bonusFeatureId: 'fs', scatterCount: 6 })
    let options = { slotSlug: 'hacksaw-octo-attack', skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(false) // 3 < 4 -> false (continue)

    // Octo fs_1 (3 Scatter) bei Min 4 -> Soll weiterspielen (nicht skippen)
    parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, bonusFeatureId: 'fs_1', scatterCount: 0 }) // scatter count irrelevant
    options = { slotSlug: 'hacksaw-octo-attack', skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(false)

    // Octo fs_1 bei Min 3 -> Soll stoppen (skippen)
    parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, bonusFeatureId: 'fs_1' })
    options = { slotSlug: 'hacksaw-octo-attack', skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 3 }
    expect(shouldSkipBonus(parsed, options)).toBe(true)

    // Octo fs_2 (Super Bonus / 4 Scatter) bei Min 4 -> Soll stoppen (skippen)
    parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, bonusFeatureId: 'fs_2' })
    options = { slotSlug: 'hacksaw-octo-attack', skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(true)
    
    // Global fallback check (without slotSlug, fs_1 should still work as fallback global mapping or default)
    // Note: In new logic, fs_1 is in global fallback too.
    parsed = mockParsed({ isBonus: true, shouldStopOnBonus: true, bonusFeatureId: 'fs_1' })
    options = { skipContinueOnBonus: true, skipContinueIfBonusMinScatter: 4 }
    expect(shouldSkipBonus(parsed, options)).toBe(false)
  })

  it('should NOT skip if not a bonus', () => {
    const parsed = mockParsed({ isBonus: false })
    const options = { skipContinueOnBonus: true }
    expect(shouldSkipBonus(parsed, options)).toBe(false)
  })
})
