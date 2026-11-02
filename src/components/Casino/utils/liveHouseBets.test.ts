import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIVE_BET_THRESHOLDS,
  appendLiveBets,
  computeLiveStats,
  filterLiveBets,
  isBonusPayload,
  listLiveGames,
  toLiveBet,
  type LiveBet,
} from './liveHouseBets'

const usd = (amount: number, currency: string) => (currency === 'usdc' ? amount : currency === 'btc' ? amount * 60000 : null)
const th = DEFAULT_LIVE_BET_THRESHOLDS

const bet = (over: Record<string, unknown> = {}, now = 1000) =>
  toLiveBet(
    { shareIid: 'house:1', gameName: 'Mines', amount: 1, payout: 2, currency: 'USDC', payoutMultiplier: 2, betType: 'CasinoBet', ...over },
    now
  ) as LiveBet

describe('liveHouseBets', () => {
  it('normalises a payload', () => {
    const b = bet()
    expect(b.key).toBe('house:1')
    expect(b.shareId).toBe('house:1')
    expect(b.game).toBe('Mines')
    expect(b.currency).toBe('usdc')
    expect(b.multiplier).toBe(2)
    expect(b.isBonus).toBe(false)
  })

  it('rejects payloads without any id', () => {
    expect(toLiveBet({ gameName: 'x' })).toBe(null)
    expect(toLiveBet(null)).toBe(null)
  })

  it('detects bonus bets', () => {
    expect(isBonusPayload({ betType: 'SomeBonusBet', amount: 1 })).toBe(true)
    expect(isBonusPayload({ amount: 0, payout: 5 })).toBe(true)
    expect(isBonusPayload({ amount: null, payoutMultiplier: 20 })).toBe(true)
    expect(isBonusPayload({ amount: 1, payout: 0, payoutMultiplier: 0 })).toBe(false)
    expect(isBonusPayload({ amount: 1, payout: 5, payoutMultiplier: 5 })).toBe(false)
  })

  it('appends newest first, dedupes by key and caps the buffer', () => {
    const a = bet({ shareIid: 'a' })
    const b = bet({ shareIid: 'b' })
    const c = bet({ shareIid: 'c' })
    let list = appendLiveBets([], [a, b])
    expect(list.map((x) => x.key)).toEqual(['b', 'a'])
    list = appendLiveBets(list, [c, a])
    expect(list.map((x) => x.key)).toEqual(['a', 'c', 'b'])
    expect(appendLiveBets(list, [bet({ shareIid: 'd' })], 2).map((x) => x.key)).toEqual(['d', 'a'])
  })

  it('filters high multiplier, high win (USD), bonus and game', () => {
    const list = [
      bet({ shareIid: '1', payoutMultiplier: 150, payout: 150, amount: 1 }),
      bet({ shareIid: '2', payoutMultiplier: 5, payout: 400, amount: 80 }),
      bet({ shareIid: '3', payoutMultiplier: 2, payout: 0.001, amount: 0.0005, currency: 'btc', gameName: 'Dice' }),
      bet({ shareIid: '4', amount: 0, payout: 9, payoutMultiplier: 9, gameName: 'Dice' }),
    ]
    expect(filterLiveBets(list, 'high_multiplier', th, usd).map((b) => b.key)).toEqual(['1'])
    expect(filterLiveBets(list, 'high_win', th, usd).map((b) => b.key)).toEqual(['2'])
    expect(filterLiveBets(list, 'bonuses', th, usd).map((b) => b.key)).toEqual(['4'])
    expect(filterLiveBets(list, 'all', th, usd, 'Dice').map((b) => b.key)).toEqual(['3', '4'])
  })

  it('treats a missing FX rate as not high win', () => {
    const unknown = bet({ shareIid: 'x', currency: 'doge', payout: 1e9 })
    expect(filterLiveBets([unknown], 'high_win', th, usd)).toEqual([])
  })

  it('computes stats and game list', () => {
    const list = [
      bet({ shareIid: '1', payoutMultiplier: 150, payout: 150 }),
      bet({ shareIid: '2', payoutMultiplier: 5, payout: 400, amount: 80, gameName: 'Dice' }),
      bet({ shareIid: '3', amount: 0, payout: 9, payoutMultiplier: 9, gameName: 'Dice' }),
    ]
    const s = computeLiveStats(list, th, usd)
    expect(s).toEqual({ total: 3, bonuses: 1, highMultiplier: 1, highWin: 1, best: { multiplier: 150, game: 'Mines' } })
    expect(computeLiveStats(list, th, usd, 'Dice').total).toBe(2)
    expect(listLiveGames(list)).toEqual(['Dice', 'Mines'])
  })
})
