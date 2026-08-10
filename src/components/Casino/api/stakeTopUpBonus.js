/**
 * Stake.eu VIP Top-Up Bonus (Gold Coins) — VipMeta + ClaimTopUpBonus.
 * HAR: stakeeugcclaim.har
 *
 * topUpBonus fields (VipMeta / stake.eu frontend): id, amounts, active,
 * claimCount, lastClaim, createdAt, updatedAt — no claimInterval (unlike faucet reload).
 * Frontend claim gate is gold balance threshold only; server enforces claim cooldown.
 *
 * Gold balance comes from UserBalances (wallet helper), not VipMeta —
 * UserBalance has no top-level `currency` field (only available/vault).
 */

import { StakeApi } from '../../../api/client'
import { refreshWalletBalances, walletBalanceMajor } from '../../../utils/walletBalance'

const VIP_META_TOPUP_QUERY = `query VipMeta($topUpEnabled: Boolean!) {
  user {
    id
    topUpBonus @include(if: $topUpEnabled) {
      id
      amounts {
        currency
        amount
      }
      active
      claimCount
      lastClaim
      createdAt
      updatedAt
    }
  }
}`

const CLAIM_TOPUP_MUTATION = `mutation ClaimTopUpBonus($turnstileToken: String!) {
  claimTopUpBonus(turnstileToken: $turnstileToken) {
    amount
    createdAt
    currency
    id
  }
}`

/** Soft fallback only when API gives no interval / error wait (documented in logs). */
export const TOPUP_SOFT_COOLDOWN_MS = 5 * 60 * 1000
/** Poll meta/claim when wait is unknown. */
export const TOPUP_CLAIM_POLL_MS = 45_000

/**
 * @typedef {{ currency: string, amount: number }} TopUpAmount
 * @typedef {{
 *   id?: string,
 *   amounts?: TopUpAmount[],
 *   active?: boolean,
 *   claimCount?: number,
 *   claimInterval?: number | null,
 *   lastClaim?: string | null,
 *   createdAt?: string,
 *   updatedAt?: string,
 * }} TopUpBonus
 */

/**
 * Fetch top-up bonus meta + gold balance (via UserBalances / wallet store).
 * @returns {Promise<{ topUpBonus: TopUpBonus | null, goldBalance: number, userId?: string }>}
 */
export async function fetchTopUpMeta() {
  const res = await StakeApi.query(VIP_META_TOPUP_QUERY, {
    topUpEnabled: true,
  })
  const user = res?.data?.user
  const topUpBonus = user?.topUpBonus || null
  let goldBalance = 0
  try {
    await refreshWalletBalances()
    goldBalance = walletBalanceMajor('gold')
  } catch {
    goldBalance = walletBalanceMajor('gold')
  }
  return {
    topUpBonus,
    goldBalance,
    userId: user?.id ? String(user.id) : undefined,
  }
}

/**
 * Claim top-up bonus with a Turnstile token.
 * @param {string} turnstileToken
 * @returns {Promise<Array<{ amount?: number, currency?: string, id?: string, createdAt?: string }>>}
 */
export async function claimTopUpBonus(turnstileToken) {
  const token = String(turnstileToken || '').trim()
  if (!token || token.length < 20) {
    throw new Error('Missing Turnstile token')
  }
  const res = await StakeApi.mutate(
    CLAIM_TOPUP_MUTATION,
    { turnstileToken: token },
    { referer: 'https://stake.eu/?tab=progress&modal=claimTopUp', language: 'de' }
  )
  const rows = res?.data?.claimTopUpBonus
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('claimTopUpBonus returned no data')
  }
  return rows
}

/**
 * Interval ms from topUpBonus if API ever exposes claimInterval (ms or seconds).
 * HAR/stake.eu VipMeta does not request this field today — returns null.
 * @param {TopUpBonus | null | undefined} topUp
 * @returns {number | null}
 */
export function topUpIntervalMsFromMeta(topUp) {
  if (!topUp) return null
  const raw = topUp.claimInterval
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  // Heuristic: values < 1e6 treated as seconds (faucet-style); else ms
  return n < 1_000_000 ? n * 1000 : n
}

/**
 * Milliseconds until top-up is claimable again from lastClaim + interval.
 * @param {string | null | undefined} lastClaim
 * @param {number} intervalMs
 */
export function topUpCooldownRemainingMs(lastClaim, intervalMs = TOPUP_SOFT_COOLDOWN_MS) {
  if (!lastClaim) return 0
  const t = Date.parse(String(lastClaim))
  if (!Number.isFinite(t)) return 0
  const readyAt = t + Math.max(0, Number(intervalMs) || 0)
  return Math.max(0, readyAt - Date.now())
}

/**
 * Absolute ready-at timestamp from lastClaim + interval, or 0 if unknown.
 * @param {string | null | undefined} lastClaim
 * @param {number | null | undefined} intervalMs
 */
export function topUpReadyAtMs(lastClaim, intervalMs) {
  if (!lastClaim || intervalMs == null || !(Number(intervalMs) > 0)) return 0
  const t = Date.parse(String(lastClaim))
  if (!Number.isFinite(t)) return 0
  return t + Number(intervalMs)
}

/**
 * Parse retry / cooldown wait from GraphQL or HTTP error text.
 * @param {unknown} errOrMessage
 * @returns {number | null} wait ms, or null if not found
 */
export function parseClaimWaitMsFromMessage(errOrMessage) {
  const msg =
    errOrMessage instanceof Error
      ? errOrMessage.message
      : typeof errOrMessage === 'string'
        ? errOrMessage
        : String(errOrMessage || '')
  if (!msg) return null
  const lower = msg.toLowerCase()

  // retry-after: 120 / Retry-After: 120
  const retryAfter = lower.match(/retry[_\s-]?after\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
  if (retryAfter) {
    const sec = Number(retryAfter[1])
    if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000)
  }

  // "try again in 5 minutes" / "claim again in 90 seconds" / "wait 2 min"
  const inUnit = lower.match(
    /(?:try again|claim again|available|retry|wait|cooldown|in)\s*(?:in\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i
  )
  if (inUnit) {
    const n = Number(inUnit[1])
    const unit = inUnit[2]
    if (Number.isFinite(n) && n > 0) {
      if (/^m(in(ute)?s?)?$/i.test(unit)) return Math.round(n * 60_000)
      return Math.round(n * 1000)
    }
  }

  // "wait 120s" / "cooldown 5m"
  const compact = lower.match(/(?:wait|cooldown|retry)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(ms|s|m)\b/i)
  if (compact) {
    const n = Number(compact[1])
    const unit = compact[2]
    if (Number.isFinite(n) && n > 0) {
      if (unit === 'ms') return Math.round(n)
      if (unit === 'm') return Math.round(n * 60_000)
      return Math.round(n * 1000)
    }
  }

  return null
}

/**
 * Format remaining wait for UI: "Xm Ys" / "Ys".
 * @param {number} ms
 */
export function formatClaimWait(ms) {
  const totalSec = Math.max(0, Math.ceil(Number(ms) / 1000) || 0)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${s}s`
}

/**
 * True when error looks like claim cooldown / rate limit (not balance / turnstile).
 * @param {unknown} errOrMessage
 */
export function isTopUpCooldownError(errOrMessage) {
  const msg =
    errOrMessage instanceof Error
      ? errOrMessage.message
      : String(errOrMessage || '')
  if (!msg) return false
  if (parseClaimWaitMsFromMessage(msg) != null) return true
  return /cooldown|too soon|try again|not (yet )?available|rate.?limit|wait|claim.*(later|again)|already claimed/i.test(
    msg
  )
}

