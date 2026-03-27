/**
 * Eine Blackjack-Runde im Script-Mode: REST bet/next + Basic Strategy.
 */

import { stakeBlackjackBet, stakeBlackjackNext } from '../../../api/stakeOriginalsBets'
import {
  classifyPair,
  decideBasicStrategy,
  dealerUpRankToValue,
  mapStrategyToApiAction,
  type StrategyAction,
} from './blackjackBasicStrategy'

function unwrapBet(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const b = o.blackjackBet ?? o.blackjackNext
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : null
}

function describeStakeBlackjackFailure(raw: unknown): string {
  if (raw == null) return 'Leere API-Antwort'
  if (typeof raw !== 'object') return String(raw).slice(0, 400)
  const o = raw as Record<string, unknown>
  if (typeof o.message === 'string' && o.message) return o.message
  if (typeof o.error === 'string' && o.error) return o.error
  if (Array.isArray(o.errors) && o.errors[0] && typeof o.errors[0] === 'object' && o.errors[0] !== null) {
    const m = (o.errors[0] as { message?: string }).message
    if (typeof m === 'string' && m) return m
  }
  try {
    return `Unerwartetes JSON (kein blackjackBet): ${JSON.stringify(raw).slice(0, 500)}`
  } catch {
    return 'Unerwartete API-Antwort'
  }
}

/** Ein sichtbares Ass (Versicherungsangebot), auch wenn `actions` nur `["deal"]` sind (kein Schlüsselwort insurance). */
function dealerShowsSingleAce(dealer: { cards?: { rank: string }[] } | undefined): boolean {
  const c = dealer?.cards
  return !!(c && c.length === 1 && String(c[0]?.rank || '').toUpperCase() === 'A')
}

/**
 * Stake: `actions` ist eine Historie (deal, split, stand, …). Letzte Aktion stand/double = diese Hand ist fertig.
 * Erlaubte Züge leiten wir aus **Karten** ab — nicht aus dem Filter der Historie: z.B. `["deal","insurance","split"]`
 * enthält nur `split` als PLAY_ACTION-Token; früher würden wir nur `["split"]` zurückgeben statt hit/stand/double.
 */
function isPlayerHandComplete(actions: string[] | undefined): boolean {
  const a = actions || []
  if (a.includes('bust') || a.includes('full')) return true
  if (a.length === 0) return false
  const last = a[a.length - 1]
  return last === 'stand' || last === 'double'
}

function effectivePlayerActions(
  hand: { actions?: string[]; cards?: { rank: string }[] },
  /** >1: bereits gesplittet — Stake erlaubt kein Re-Split; Paare sonst fälschlich wieder „split“ (Screenshot 3+3 aktiv). */
  playerHandCount: number
): string[] {
  const raw = hand.actions || []
  if (raw.includes('bust') || raw.includes('full')) return []
  if (isPlayerHandComplete(raw)) return []

  const cards = hand.cards || []
  if (cards.length === 0) return []

  const n = cards.length
  const out: string[] = ['hit', 'stand']
  if (n === 2) {
    out.push('double')
    if (playerHandCount === 1 && classifyPair(cards) !== null) out.push('split')
  }
  return out
}

function findActiveHandIndex(
  players: { actions?: string[]; cards?: { rank: string }[] }[],
  splitHandCursor: number
): number {
  const n = players.length
  if (n === 0) return -1
  if (n === 1) {
    return effectivePlayerActions(players[0], 1).length > 0 ? 0 : -1
  }

  const pending: number[] = []
  for (let i = 0; i < n; i++) {
    if (effectivePlayerActions(players[i], n).length > 0) pending.push(i)
  }
  if (pending.length === 1) {
    return pending[0]
  }
  if (pending.length > 1) {
    for (let k = 0; k < n; k++) {
      const i = (splitHandCursor + k) % n
      if (pending.includes(i)) return i
    }
    return pending[0]
  }
  return -1
}

export interface BlackjackScriptRoundResult {
  /** Auszahlung in Spielwährung */
  payout: number
  /** Gesamteinsatz laut Bet-Objekt (inkl. Double/Split) */
  amount: number
}

/**
 * Spielt eine komplette Runde bis `active === false`.
 */
export async function playBlackjackScriptRound(opts: {
  amount: number
  currency: string
  signal: { cancelled: boolean }
  onLog?: (msg: string) => void
}): Promise<BlackjackScriptRoundResult> {
  const { amount, currency, signal, onLog } = opts

  let raw = await stakeBlackjackBet({ amount, currency, identifier: undefined })
  let bet = unwrapBet(raw)
  if (!bet) {
    throw new Error(describeStakeBlackjackFailure(raw))
  }

  let safety = 0
  let insuranceDeclineAttempts = 0
  /** Nach erfolgreichem `noInsurance` – verhindert Doppel-Calls, auch wenn die API noch `insurance` in actions lässt. */
  let dealerAceInsuranceDeclined = false
  /** Nach Split: nächste Hand, die bedient wird (Rotation nach stand/double). */
  let splitHandCursor = 0
  while (bet && bet.active && safety++ < 250) {
    if (signal.cancelled) throw new Error('Abgebrochen')

    const state = bet.state as
      | {
          player?: { value?: number; actions?: string[]; cards?: { rank: string }[] }[]
          dealer?: { value?: number; actions?: string[]; cards?: { rank: string }[] }[]
        }
      | undefined
    if (!state?.player?.length || !state.dealer?.length) break

    const dealer = state.dealer[0]
    const players = state.player

    const explicitInsurance = players.some((p) => (p.actions || []).includes('insurance'))
    /**
     * Stake: Vor dem ersten hit/stand/… oft `noInsurance`, auch wenn player.actions nur `["deal"]` sind
     * (Dealer-Ass, aber kein Schlüsselwort `insurance` im Array) – siehe User-Capture.
     * `!anyPlay` darf nicht greifen: nach Split steht `split` in der Historie — sonst wird nie `noInsurance` gesendet.
     */
    const needDeclineInsurance =
      !dealerAceInsuranceDeclined && (explicitInsurance || dealerShowsSingleAce(dealer))

    if (needDeclineInsurance) {
      insuranceDeclineAttempts++
      if (insuranceDeclineAttempts > 12) {
        throw new Error(
          'Blackjack: Versicherung lässt sich nicht abschließen (noInsurance ohne Wirkung oder Schleife).'
        )
      }
      const attempts = ['noInsurance', 'decline', 'declineInsurance']
      let ok = false
      for (const action of attempts) {
        if (signal.cancelled) throw new Error('Abgebrochen')
        try {
          raw = await stakeBlackjackNext({ action, identifier: undefined })
          bet = unwrapBet(raw)
          if (bet) {
            ok = true
            dealerAceInsuranceDeclined = true
            onLog?.(`Blackjack: Insurance → ${action}`)
            break
          }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e)
          onLog?.(`Blackjack: Insurance ${action} fehlgeschlagen (${m.slice(0, 80)})`)
        }
      }
      if (!ok) throw new Error('Blackjack: Insurance konnte nicht abgelehnt werden (API).')
      continue
    }
    insuranceDeclineAttempts = 0

    const idx = findActiveHandIndex(players, splitHandCursor)
    if (idx < 0) break

    const hand = players[idx]
    const cards = hand.cards || []
    const allowed = effectivePlayerActions(hand, players.length)
    if (allowed.length === 0) break

    const up = dealer.cards?.[0]
    if (!up) break
    const dealerUpValue = dealerUpRankToValue(up.rank)

    let decision: StrategyAction = decideBasicStrategy({
      cards,
      dealerUpValue,
      canSplit: allowed.includes('split'),
      canDouble: allowed.includes('double'),
    })

    if (decision === 'split' && !allowed.includes('split')) {
      decision = decideBasicStrategy({
        cards,
        dealerUpValue,
        canSplit: false,
        canDouble: allowed.includes('double'),
      })
    }

    let apiAction = mapStrategyToApiAction(decision, allowed)
    if (!apiAction) {
      onLog?.(`Blackjack: keine passende Aktion (${allowed.join(',')}), stand`)
      apiAction = allowed.includes('stand') ? 'stand' : allowed.includes('hit') ? 'hit' : null
    }
    if (!apiAction) throw new Error('Blackjack: keine gültige Spielaktion.')

    const prevPlayerCount = players.length
    raw = await stakeBlackjackNext({ action: apiAction, identifier: undefined })
    bet = unwrapBet(raw)
    if (!bet) throw new Error('Blackjack: keine Antwort nach next')

    if (prevPlayerCount > 1) {
      if (apiAction === 'split') {
        splitHandCursor = 0
      } else if (apiAction === 'stand' || apiAction === 'double') {
        splitHandCursor = (idx + 1) % prevPlayerCount
      }
    }
  }

  if (!bet) throw new Error('Blackjack: keine Bet-Daten nach Runde')
  const payout = Number(bet.payout ?? 0) || 0
  const amt = Number(bet.amount ?? 0) || 0
  return { payout, amount: amt }
}
