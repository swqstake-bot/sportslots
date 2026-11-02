import { describe, expect, it } from 'vitest'
import {
  createBetProgression,
  fibonacciAt,
  readProgressionParams,
  type StrategyPresetId,
} from './betProgression'

const make = (preset: StrategyPresetId, extra: Record<string, unknown> = {}) =>
  createBetProgression(readProgressionParams({ strategyPreset: preset, ...extra }))

describe('betProgression', () => {
  it('custom is inactive and always returns 1', () => {
    const p = make('custom')
    expect(p.active).toBe(false)
    expect(p.onLoss()).toBe(1)
    expect(p.onWin()).toBe(1)
  })

  it('falls back to custom for unknown presets', () => {
    expect(readProgressionParams({ strategyPreset: 'nonsense' }).preset).toBe('custom')
    expect(readProgressionParams({}).preset).toBe('custom')
  })

  it('flat never changes the bet', () => {
    const p = make('flat')
    expect([p.onLoss(), p.onLoss(), p.onWin()]).toEqual([1, 1, 1])
  })

  it('martingale doubles on loss and resets on win', () => {
    const p = make('martingale')
    expect([p.onLoss(), p.onLoss(), p.onLoss()]).toEqual([2, 4, 8])
    expect(p.onWin()).toBe(1)
  })

  it('martingale resets after maxSteps losses', () => {
    const p = make('martingale', { strategyMaxSteps: 3 })
    expect([p.onLoss(), p.onLoss(), p.onLoss(), p.onLoss()]).toEqual([2, 4, 8, 1])
  })

  it('anti-martingale doubles on win and resets on loss', () => {
    const p = make('anti-martingale')
    expect([p.onWin(), p.onWin(), p.onWin()]).toEqual([2, 4, 8])
    expect(p.onLoss()).toBe(1)
  })

  it('paroli doubles up to N wins then resets', () => {
    const p = make('paroli')
    expect([p.onWin(), p.onWin(), p.onWin()]).toEqual([2, 4, 1])
    expect([p.onWin(), p.onLoss()]).toEqual([2, 1])
  })

  it('paroli honours a custom win count', () => {
    const p = make('paroli', { strategyParoliWins: 2 })
    expect([p.onWin(), p.onWin()]).toEqual([2, 1])
  })

  it("d'alembert adds a unit on loss and removes one on win, never below base", () => {
    const p = make('dalembert')
    expect([p.onLoss(), p.onLoss(), p.onWin(), p.onWin(), p.onWin()]).toEqual([2, 3, 2, 1, 1])
  })

  it("d'alembert unit is a percentage of the base bet and can be capped", () => {
    const p = make('dalembert', { strategyUnitPct: 50, strategyMaxSteps: 2 })
    expect([p.onLoss(), p.onLoss(), p.onLoss()]).toEqual([1.5, 2, 2])
  })

  it('fibonacci moves forward on loss and two back on win', () => {
    expect(Array.from({ length: 7 }, (_, i) => fibonacciAt(i))).toEqual([1, 1, 2, 3, 5, 8, 13])
    const p = make('fibonacci')
    expect([p.onLoss(), p.onLoss(), p.onLoss(), p.onLoss()]).toEqual([1, 2, 3, 5])
    expect([p.onWin(), p.onWin(), p.onWin()]).toEqual([2, 1, 1])
  })

  it('fibonacci resets after maxSteps', () => {
    const p = make('fibonacci', { strategyMaxSteps: 2 })
    expect([p.onLoss(), p.onLoss(), p.onLoss()]).toEqual([1, 2, 1])
  })

  it('reset returns to step 0', () => {
    const p = make('martingale')
    p.onLoss()
    p.onLoss()
    p.reset()
    expect(p.multiplier()).toBe(1)
    expect(p.step).toBe(0)
  })
})
