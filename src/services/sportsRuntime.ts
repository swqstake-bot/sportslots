import { StakeApi } from '../api/client'
import { Queries } from '../api/queries'
import { createEventEnvelope, generateCorrelationId } from '../utils/eventEnvelope'
import { publishRealtimeEvent } from './realtimeBus'

export type SportsRuntimeState = 'idle' | 'placing' | 'placed' | 'failed'
export type SportsErrorCode = 'validation' | 'auth' | 'rate-limit' | 'transient' | 'unknown'

export interface PlaceSportBetInput {
  amount: number
  currency: string
  outcomeIds: string[]
  betType?: string
  oddsChange?: string
  identifier?: string
  stakeShieldEnabled?: boolean
  stakeShieldProtectionLevel?: number
  stakeShieldOfferOdds?: number
}

export interface SportsRuntimeError extends Error {
  code: SportsErrorCode
  retryable: boolean
  userMessage: string
  correlationId: string
}

export interface PlaceSportBetResult {
  bet: any | null
  correlationId: string
  state: SportsRuntimeState
}

function classifySportsError(err: unknown): { code: SportsErrorCode; retryable: boolean; userMessage: string } {
  const msg = String((err as any)?.message || err || '').toLowerCase()
  if (msg.includes('stake amount') || msg.includes('valid') || msg.includes('ungültig')) {
    return { code: 'validation', retryable: false, userMessage: 'Ungültiger Einsatz oder ungültige Auswahl.' }
  }
  if (msg.includes('token') || msg.includes('auth') || msg.includes('session')) {
    return { code: 'auth', retryable: false, userMessage: 'Session/Authentifizierung fehlgeschlagen.' }
  }
  if (msg.includes('429') || msg.includes('too many') || msg.includes('rate')) {
    return { code: 'rate-limit', retryable: true, userMessage: 'Zu viele Anfragen. Bitte kurz warten.' }
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return { code: 'transient', retryable: true, userMessage: 'Temporärer Netzwerkfehler. Neuer Versuch läuft.' }
  }
  return { code: 'unknown', retryable: false, userMessage: 'Sport-Bet konnte nicht platziert werden.' }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizePlaceResponse(response: any) {
  return response?.data?.sportBet || response?.data?.createSportBet || null
}

export async function placeSportBetWithPolicy(input: PlaceSportBetInput, options?: { maxAttempts?: number; correlationId?: string }): Promise<PlaceSportBetResult> {
  const correlationId = options?.correlationId || generateCorrelationId('sports-bet')
  const maxAttempts = Math.max(1, Number(options?.maxAttempts || 2))
  let state: SportsRuntimeState = 'idle'
  let lastError: any = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    state = 'placing'
    try {
      const variables = {
        ...input,
        betType: input.betType || 'sports',
        oddsChange: input.oddsChange || 'any',
      }
      const response = await StakeApi.query(Queries.PlaceSportBet, variables)
      const bet = normalizePlaceResponse(response)
      if (!bet) {
        throw new Error(response?.errors?.[0]?.message || 'No bet returned')
      }
      state = 'placed'
      const envelope = createEventEnvelope('sports.placeBet.success', {
        correlationId,
        attempt,
        betId: bet?.id || null,
        amount: input.amount,
        currency: input.currency,
      }, correlationId)
      publishRealtimeEvent('sports.placeBet.success', envelope.payload, correlationId)
      try {
        window.dispatchEvent(new CustomEvent('sports-runtime-event', { detail: envelope }))
      } catch {
        // Browser event dispatch failures are non-fatal for runtime flow.
      }
      return { bet, correlationId, state }
    } catch (err) {
      lastError = err
      const mapped = classifySportsError(err)
      const envelope = createEventEnvelope('sports.placeBet.error', {
        correlationId,
        attempt,
        code: mapped.code,
        retryable: mapped.retryable,
        rawMessage: String((err as any)?.message || err || ''),
      }, correlationId)
      publishRealtimeEvent('sports.placeBet.error', envelope.payload, correlationId)
      try {
        window.dispatchEvent(new CustomEvent('sports-runtime-event', { detail: envelope }))
      } catch {
        // Browser event dispatch failures are non-fatal for runtime flow.
      }
      if (!mapped.retryable || attempt >= maxAttempts) {
        state = 'failed'
        const out = new Error(mapped.userMessage) as SportsRuntimeError
        out.code = mapped.code
        out.retryable = mapped.retryable
        out.userMessage = mapped.userMessage
        out.correlationId = correlationId
        throw out
      }
      await sleep(250 * attempt)
    }
  }

  state = 'failed'
  const mapped = classifySportsError(lastError)
  const out = new Error(mapped.userMessage) as SportsRuntimeError
  out.code = mapped.code
  out.retryable = mapped.retryable
  out.userMessage = mapped.userMessage
  out.correlationId = correlationId
  throw out
}

