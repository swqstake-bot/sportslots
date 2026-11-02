import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import { betShareIdRegistry } from '../../utils/betShareIdRegistry'
import { convertToUsd } from '../../utils/monetaryContract'
import {
  DEFAULT_LIVE_BET_THRESHOLDS,
  appendLiveBets,
  computeLiveStats,
  filterLiveBets,
  isHighMultiplier,
  listLiveGames,
  toLiveBet,
  type LiveBet,
  type LiveBetFilter,
  type LiveBetThresholds,
} from '../../utils/liveHouseBets'

const SETTINGS_KEY = 'swq_live_bets_settings_v1'
const FLUSH_MS = 300
const LIVE_WINDOW_MS = 15_000
const RATES_REFRESH_MS = 10 * 60 * 1000
const MAX_ROWS = 60
const MAX_INCOMING = 1000

type Settings = LiveBetThresholds & { filter: LiveBetFilter; game: string }

const FILTERS: { id: LiveBetFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bonuses', label: 'Bonuses' },
  { id: 'high_multiplier', label: 'High multi' },
  { id: 'high_win', label: 'High win' },
]

function loadSettings(): Settings {
  const base: Settings = { ...DEFAULT_LIVE_BET_THRESHOLDS, filter: 'all', game: 'all' }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return base
    const o = JSON.parse(raw) as Partial<Settings>
    return {
      filter: FILTERS.some((f) => f.id === o.filter) ? (o.filter as LiveBetFilter) : base.filter,
      game: typeof o.game === 'string' && o.game ? o.game : base.game,
      highMultiplier: Number(o.highMultiplier) >= 1 ? Number(o.highMultiplier) : base.highMultiplier,
      highWinUsd: Number(o.highWinUsd) >= 1 ? Number(o.highWinUsd) : base.highWinUsd,
    }
  } catch {
    return base
  }
}

function fmtAmount(n: number | null, currency: string): string {
  if (n == null) return '-'
  return `${Number(n.toPrecision(4))} ${currency.toUpperCase()}`
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false })
  } catch {
    return ''
  }
}

type LiveHouseBetsPanelProps = {
  accessToken: string
}

/**
 * Site-wide live bets (Stake houseBets stream) with Bonus / High multiplier / High win filters,
 * a per-game filter and live counters. Subscribes only while expanded.
 */
export const LiveHouseBetsPanel = memo(function LiveHouseBetsPanel({ accessToken }: LiveHouseBetsPanelProps) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [bets, setBets] = useState<LiveBet[]>([])
  const [live, setLive] = useState(false)
  const [ratesTick, setRatesTick] = useState(0)
  const incomingRef = useRef<LiveBet[]>([])
  const lastFrameAtRef = useRef(0)
  const ratesRef = useRef<Record<string, number>>({})

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* storage unavailable */
    }
  }, [settings])

  useEffect(() => {
    const token = accessToken?.trim()
    if (!open || !token) return
    let cancelled = false
    const loadRates = () => {
      void Promise.resolve(fetchCurrencyRates(token))
        .then((rates: Record<string, number> | null | undefined) => {
          if (cancelled || !rates || typeof rates !== 'object') return
          ratesRef.current = rates
          setRatesTick((t) => t + 1)
        })
        .catch(() => {
          /* rates are optional - High win simply stays empty until they load */
        })
    }
    loadRates()
    const ratesTimer = window.setInterval(loadRates, RATES_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(ratesTimer)
    }
  }, [open, accessToken])

  useEffect(() => {
    const token = accessToken?.trim()
    if (!open || !token) return
    betShareIdRegistry.ensureListening(token)
    const unsubscribe = betShareIdRegistry.subscribeHouseBets((payload: Record<string, unknown>) => {
      const bet = toLiveBet(payload)
      if (!bet) return
      lastFrameAtRef.current = Date.now()
      const queue = incomingRef.current
      queue.push(bet)
      if (queue.length > MAX_INCOMING) queue.splice(0, queue.length - MAX_INCOMING)
    })
    const flushTimer = window.setInterval(() => {
      const batch = incomingRef.current.splice(0)
      if (batch.length > 0) setBets((prev) => appendLiveBets(prev, batch))
      setLive(Date.now() - lastFrameAtRef.current < LIVE_WINDOW_MS)
    }, FLUSH_MS)
    return () => {
      window.clearInterval(flushTimer)
      unsubscribe()
      betShareIdRegistry.releaseListening(token)
      incomingRef.current = []
      setLive(false)
    }
  }, [open, accessToken])

  const toUsd = useCallback((amountMajor: number, currency: string): number | null => {
    const converted = convertToUsd(amountMajor, currency, 'major', ratesRef.current) as { usd?: number | null } | null
    const usd = converted?.usd
    return usd != null && Number.isFinite(usd) ? usd : null
  }, [])

  const thresholds = useMemo<LiveBetThresholds>(
    () => ({ highMultiplier: settings.highMultiplier, highWinUsd: settings.highWinUsd }),
    [settings.highMultiplier, settings.highWinUsd]
  )
  const games = useMemo(() => listLiveGames(bets), [bets])
  const rows = useMemo(
    () => filterLiveBets(bets, settings.filter, thresholds, toUsd, settings.game).slice(0, MAX_ROWS),
    // ratesTick: re-evaluate High win once FX rates have loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bets, settings.filter, settings.game, thresholds, toUsd, ratesTick]
  )
  const stats = useMemo(
    () => computeLiveStats(bets, thresholds, toUsd, settings.game),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bets, thresholds, toUsd, settings.game, ratesTick]
  )

  const resetCounters = () => {
    incomingRef.current = []
    setBets([])
  }

  const activeStyle = { color: 'var(--accent)', borderColor: 'var(--accent)' }
  const emptyText =
    settings.filter === 'bonuses'
      ? 'No bonus bets yet...'
      : settings.filter === 'high_multiplier'
        ? 'No high multiplier bets yet...'
        : settings.filter === 'high_win'
          ? 'No high win bets yet...'
          : 'Waiting for house bet events...'

  return (
    <div className="challenge-hub-activity-live" aria-label="Live house bets">
      <div className="challenge-hub-activity-head">
        <p className="challenge-hub-activity-label">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
            style={{ background: open && live ? '#22c55e' : 'var(--text-muted)' }}
          />
          Live Bets
        </p>
        <div className="challenge-hub-activity-controls">
          {open ? (
            <button
              type="button"
              className="challenge-hub-action challenge-hub-action--danger"
              title="Clear the list and reset the counters"
              onClick={resetCounters}
            >
              Reset
            </button>
          ) : null}
          <button type="button" className="challenge-hub-action challenge-hub-action--ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {open ? (
        <>
          <div className="challenge-hub-activity-controls flex-wrap mb-1" role="group" aria-label="Bet filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={settings.filter === f.id}
                className="challenge-hub-action challenge-hub-action--ghost"
                style={settings.filter === f.id ? activeStyle : undefined}
                onClick={() => setSettings((s) => ({ ...s, filter: s.filter === f.id ? 'all' : f.id }))}
              >
                {f.label}
              </button>
            ))}
            <select
              className="challenge-hub-activity-select"
              aria-label="Live Stats game filter"
              value={games.includes(settings.game) || settings.game === 'all' ? settings.game : 'all'}
              onChange={(e) => setSettings((s) => ({ ...s, game: e.target.value || 'all' }))}
            >
              <option value="all">All games</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="challenge-hub-activity-controls flex-wrap mb-1 text-[11px] text-[var(--text-muted)]">
            <label className="flex items-center gap-1" title="A bet counts as high multiplier at or above this multiplier">
              High multi (x)
              <input
                type="number"
                min={1}
                step={1}
                className="w-16 rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-0.5 text-[11px]"
                value={settings.highMultiplier}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v >= 1) setSettings((s) => ({ ...s, highMultiplier: v }))
                }}
              />
            </label>
            <label className="flex items-center gap-1" title="A bet counts as high win when its payout is at or above this USD value">
              High win ($)
              <input
                type="number"
                min={1}
                step={1}
                className="w-16 rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-0.5 text-[11px]"
                value={settings.highWinUsd}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v >= 1) setSettings((s) => ({ ...s, highWinUsd: v }))
                }}
              />
            </label>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] mb-1 tabular-nums">
            Bets {stats.total} · Bonus {stats.bonuses} · &ge;{settings.highMultiplier}x {stats.highMultiplier} · &ge;$
            {settings.highWinUsd} {stats.highWin}
            {stats.best ? ` · Best ${stats.best.multiplier.toFixed(2)}x (${stats.best.game})` : ''}
          </p>

          {rows.length === 0 ? (
            <p className="challenge-hub-activity-empty">{emptyText}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {rows.map((b) => {
                const high = isHighMultiplier(b, thresholds)
                return (
                  <div
                    key={b.key}
                    className="flex items-center gap-2 px-1 py-0.5 text-[11px] border-b border-[var(--border)]"
                    style={high ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)' } : undefined}
                  >
                    <span className="w-[56px] shrink-0 tabular-nums text-[var(--text-muted)]">{fmtTime(b.at)}</span>
                    <span className="flex-1 min-w-0 truncate" title={b.game}>
                      {b.game}
                      {b.isBonus ? <span className="ml-1 text-[9px] font-bold text-[var(--accent)]">BONUS</span> : null}
                    </span>
                    <span className="w-[92px] shrink-0 text-right tabular-nums text-[var(--text-muted)]">
                      {fmtAmount(b.amount, b.currency)}
                    </span>
                    <span className="w-[62px] shrink-0 text-right tabular-nums font-semibold">
                      {b.multiplier != null ? `${b.multiplier.toFixed(2)}x` : '-'}
                    </span>
                    <span className="w-[92px] shrink-0 text-right tabular-nums">{fmtAmount(b.payout, b.currency)}</span>
                    {b.shareId ? (
                      <button
                        type="button"
                        className="challenge-hub-highlight-copy"
                        title={`Copy house id (${b.shareId})`}
                        onClick={() => {
                          try {
                            navigator?.clipboard?.writeText(b.shareId ?? '').catch(() => {})
                          } catch {
                            /* clipboard unavailable */
                          }
                        }}
                      >
                        ID
                      </button>
                    ) : (
                      <span className="w-[22px] shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
})
