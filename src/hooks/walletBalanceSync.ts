import { subscribeToStakeBalance } from '../components/Casino/api/stakeRealtimeFacade'
import { fetchCurrencyRates } from '../components/Casino/api/stakeChallenges'
import { useUserStore } from '../store/userStore'
import { refreshWalletBalances, WALLET_BALANCE_POLL_MS } from '../utils/walletBalance'

type StakeBalancePayload = {
  currency?: string
  amount?: number
  amountMajor?: number
}

type SyncOptions = {
  accessToken?: string
  poll?: boolean
  live?: boolean
}

type SyncSnapshot = {
  usdRates: Record<string, number>
  lastPollAt: number | null
  lastLiveAt: number | null
}

const listeners = new Set<(snap: SyncSnapshot) => void>()
let refCount = 0
let stopSync: (() => void) | undefined
let snapshot: SyncSnapshot = { usdRates: {}, lastPollAt: null, lastLiveAt: null }

function emit() {
  for (const fn of listeners) fn(snapshot)
}

function patchSnapshot(partial: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...partial }
  emit()
}

export async function resolveStakeAccessToken(explicit?: string): Promise<string> {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  try {
    const sessionStatus = await window.electronAPI.getStakeSessionStatus?.()
    const t = sessionStatus?.sessionToken || (await window.electronAPI.getSessionToken())
    return t?.trim() || ''
  } catch {
    return ''
  }
}

function startWalletBalanceSync(options: SyncOptions): () => void {
  const poll = options.poll ?? true
  const live = options.live ?? true
  let cancelled = false
  let resolvedToken = ''
  let pollId: number | undefined
  let ratesId: number | undefined
  let balanceSub: { disconnect?: () => void } | null = null

  const pull = async () => {
    try {
      await refreshWalletBalances()
      if (!cancelled) patchSnapshot({ lastPollAt: Date.now() })
    } catch {
      /* keep store */
    }
  }

  const boot = async () => {
    resolvedToken = await resolveStakeAccessToken(options.accessToken)
    if (cancelled || !resolvedToken) return

    try {
      const map = await fetchCurrencyRates(resolvedToken)
      if (!cancelled && map && typeof map === 'object') patchSnapshot({ usdRates: map })
    } catch {
      /* optional */
    }

    ratesId = window.setInterval(() => {
      void fetchCurrencyRates(resolvedToken).then((map) => {
        if (!cancelled && map && typeof map === 'object') patchSnapshot({ usdRates: map })
      })
    }, 10 * 60 * 1000)

    if (live) {
      const onBalanceUpdate = (payload: StakeBalancePayload) => {
        if (!payload?.currency) return
        const c = String(payload.currency).toLowerCase()
        const amt =
          payload.amountMajor != null && Number.isFinite(Number(payload.amountMajor))
            ? Number(payload.amountMajor)
            : Number(payload.amount)
        if (!Number.isFinite(amt)) return
        useUserStore.getState().patchBalance(c, amt)
        patchSnapshot({ lastLiveAt: Date.now() })
      }
      void subscribeToStakeBalance(resolvedToken, onBalanceUpdate).then((s) => {
        if (cancelled) {
          try {
            s?.disconnect?.()
          } catch {
            /* ignore */
          }
          return
        }
        balanceSub = s
      })
    }

    void pull()
    if (poll) {
      pollId = window.setInterval(() => void pull(), WALLET_BALANCE_POLL_MS)
    }
  }

  void boot()

  return () => {
    cancelled = true
    if (pollId != null) clearInterval(pollId)
    if (ratesId != null) clearInterval(ratesId)
    try {
      balanceSub?.disconnect?.()
    } catch {
      /* ignore */
    }
  }
}

/** Shared poll + WS sync — ref-counted, one connection for the whole app. */
export function acquireWalletBalanceSync(options: SyncOptions = {}): () => void {
  refCount++
  if (refCount === 1) {
    stopSync = startWalletBalanceSync(options)
  }
  return () => {
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) {
      stopSync?.()
      stopSync = undefined
    }
  }
}

export function subscribeWalletBalanceSync(fn: (snap: SyncSnapshot) => void): () => void {
  listeners.add(fn)
  fn(snapshot)
  return () => listeners.delete(fn)
}

export function getWalletBalanceSyncSnapshot(): SyncSnapshot {
  return snapshot
}
