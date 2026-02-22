/**
 * Wallet – Crypto-Guthaben in USD.
 * Live-Balance via WebSocket (BalanceUpdated) + Polling-Fallback wie SSP.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchUserBalances } from '../api/stakeWallet'
import { fetchCurrencyRates } from '../api/stakeChallenges'
import { subscribeToBalanceUpdates } from '../api/stakeBalanceSubscription'
import { formatAmount } from '../utils/formatAmount'
import { SkeletonWallet } from './SkeletonLoader'

const POLL_INTERVAL_MS = 10 * 60 * 1000
const POLL_BACKOFF_MS = 30 * 60 * 1000

const STYLES = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    minWidth: 140,
  },
  title: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
  },
  currency: {
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  amount: {
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  barContainer: {
    position: 'relative',
    flex: 1,
    height: 8,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barAvail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--accent)',
  },
  barVault: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--text-muted)',
    opacity: 0.6,
  },
  total: {
    marginTop: 'var(--space-2)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border)',
    fontSize: 'var(--text-sm)',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
  },
  loading: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
  error: {
    fontSize: 'var(--text-xs)',
    color: 'var(--error)',
  },
}

export default function WalletView({ accessToken, compact = false, hideTitle = false, lastBet = null }) {
  const [available, setAvailable] = useState([])
  const [vault, setVault] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [httpOk, setHttpOk] = useState(false)
  const [liveBalances, setLiveBalances] = useState({})
  const lastRatesRef = useRef(0)
  const lastBalancesRef = useRef(0)
  const pollIntervalRef = useRef(POLL_INTERVAL_MS)
  const consecutiveFailuresRef = useRef(0)

  const refresh = useCallback((showLoading = true) => {
    if (!accessToken) return
    if (showLoading) setLoading(true)
    setError('')
    const now = Date.now()
    const shouldFetchBalances = now - lastBalancesRef.current > 10 * 60 * 1000
    const shouldFetchRates = now - lastRatesRef.current > 60 * 60 * 1000
    const balancesPromise = shouldFetchBalances
      ? fetchUserBalances(accessToken)
      : Promise.resolve({ available: [], vault: [] })
    const ratesPromise = shouldFetchRates
      ? fetchCurrencyRates(accessToken)
      : Promise.resolve(rates)
    Promise.all([balancesPromise, ratesPromise])
      .then(([{ available: av, vault: v }, ratesMap]) => {
        consecutiveFailuresRef.current = 0
        pollIntervalRef.current = POLL_INTERVAL_MS
        if (shouldFetchBalances) {
          setAvailable(av)
          setVault(v)
          lastBalancesRef.current = now
        }
        if (shouldFetchRates) {
          setRates(ratesMap)
          lastRatesRef.current = now
        }
        setHttpOk(true)
      })
      .catch((err) => {
        const is403 = /403|Forbidden/i.test(err?.message || '')
        consecutiveFailuresRef.current += 1
        if (is403 && consecutiveFailuresRef.current >= 2) {
          pollIntervalRef.current = POLL_BACKOFF_MS
        }
        setError(is403 ? 'Token abgelaufen? Bitte erneut verbinden.' : (err?.message || 'Wallet konnte nicht geladen werden.'))
      })
      .finally(() => setLoading(false))
  }, [accessToken, rates])

  useEffect(() => {
    if (!accessToken) {
      setAvailable([])
      setVault([])
      setRates({})
      setError('')
      setHttpOk(false)
      setLiveBalances({})
      lastRatesRef.current = 0
      lastBalancesRef.current = 0
      pollIntervalRef.current = POLL_INTERVAL_MS
      consecutiveFailuresRef.current = 0
      return
    }
    setHttpOk(false)
    refresh(true)
    let pollId
    const scheduleNext = () => {
      pollId = setTimeout(() => {
        refresh(false)
        scheduleNext()
      }, pollIntervalRef.current)
    }
    scheduleNext()
    return () => {
      if (pollId) clearTimeout(pollId)
    }
  }, [accessToken, refresh])

  useEffect(() => {
    if (!accessToken) return
    const sub = subscribeToBalanceUpdates(accessToken, (payload) => {
      if (!payload?.currency) return
      setLiveBalances((prev) => ({
        ...prev,
        [payload.currency]: payload.amount,
      }))
    })
    return () => {
      try {
        sub.disconnect()
      } catch (_) {}
    }
  }, [accessToken])

  if (!accessToken) return null

  const toUsd = (amount, currency) => {
    const rate = rates[currency?.toLowerCase()] ?? 0
    return rate ? amount * rate : null
  }

  const byCurrency = {}
  const availMap = {}
  for (const { currency, amount } of available) {
    const c = (currency || '').toLowerCase()
    availMap[c] = amount
  }
  for (const [currency, amount] of Object.entries(liveBalances)) {
    const c = (currency || '').toLowerCase()
    if (c) availMap[c] = amount
  }
  const effectiveAvailable = Object.entries(availMap).map(([currency, amount]) => ({ currency, amount }))
  for (const { currency, amount } of effectiveAvailable) {
    const c = (currency || '').toLowerCase()
    if (!byCurrency[c]) byCurrency[c] = { currency: c, available: 0, vault: 0 }
    byCurrency[c].available += amount
  }
  for (const { currency, amount } of vault) {
    const c = (currency || '').toLowerCase()
    if (!byCurrency[c]) byCurrency[c] = { currency: c, available: 0, vault: 0 }
    byCurrency[c].vault += amount
  }
  const combined = Object.values(byCurrency)

  combined.sort((a, b) => {
    const aUsd = toUsd(a.available + a.vault, a.currency) ?? 0
    const bUsd = toUsd(b.available + b.vault, b.currency) ?? 0
    return bUsd - aUsd
  })

  let totalUsd = 0
  for (const c of combined) {
    const usd = toUsd(c.available + c.vault, c.currency)
    if (usd != null) totalUsd += usd
  }

  const lastBetCurrency = (lastBet?.currencyCode || '').toLowerCase()
  const lastBetBalance = lastBet?.balance
  const hasLastBet = lastBetBalance != null && lastBetCurrency

  const renderFallback = () => {
    const usd = toUsd(lastBetBalance, lastBetCurrency)
    return (
      <div style={STYLES.wrapper}>
        {!hideTitle && <div style={STYLES.title}>Wallet</div>}
        <div style={STYLES.row}>
          <span style={STYLES.currency}>{lastBetCurrency}</span>
          <span style={STYLES.amount}>
            {usd != null
              ? `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : formatAmount(lastBetBalance, lastBetCurrency)}
          </span>
        </div>
        <div style={STYLES.total}>
          {usd != null
            ? `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : formatAmount(lastBetBalance, lastBetCurrency)}
        </div>
      </div>
    )
  }

  if (loading) {
    return <SkeletonWallet />
  }

  if (error && combined.length === 0) {
    if (hasLastBet) return renderFallback()
    return (
      <div style={STYLES.wrapper}>
        {!hideTitle && <div style={STYLES.title}>Wallet</div>}
        <div style={STYLES.error} title={error}>{error.length > 45 ? `${error.slice(0, 42)}…` : error}</div>
      </div>
    )
  }

  if (combined.length === 0) {
    if (hasLastBet) return renderFallback()
    return (
      <div style={STYLES.wrapper}>
        {!hideTitle && <div style={STYLES.title}>Wallet</div>}
        <div style={STYLES.loading}>Keine Guthaben</div>
      </div>
    )
  }

  return (
    <div style={STYLES.wrapper}>
      {!hideTitle && <div style={STYLES.title}>Wallet</div>}
      {!compact ? combined.map(({ currency, available: av, vault: v }) => {
        const usdAvail = toUsd(av, currency) ?? 0
        const usdVault = toUsd(v, currency) ?? 0
        const usdSum = usdAvail + usdVault
        const pAvail = totalUsd > 0 ? (usdAvail / totalUsd) * 100 : 0
        const pVault = totalUsd > 0 ? (usdVault / totalUsd) * 100 : 0
        return (
          <div key={currency} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={STYLES.row}>
              <span style={STYLES.currency}>{currency}</span>
              <span style={STYLES.amount}>
                {usdSum > 0 ? `$${usdSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </span>
            </div>
            <div style={STYLES.barRow}>
              <div style={STYLES.barContainer}>
                <div style={{ ...STYLES.barVault, width: `${pAvail + pVault}%` }} />
                <div style={{ ...STYLES.barAvail, width: `${pAvail}%` }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                A ${usdAvail.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                V ${usdVault.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )
      }) : null}
      <div style={STYLES.total}>
        ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}
