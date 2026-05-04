export const ProviderErrorCode = {
  AUTH: 'auth',
  SESSION: 'session',
  INSUFFICIENT_BALANCE: 'insufficient-balance',
  RATE_LIMIT: 'rate-limit',
  TRANSIENT: 'transient',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
}

const RETRYABLE_CODES = new Set([
  ProviderErrorCode.RATE_LIMIT,
  ProviderErrorCode.TRANSIENT,
])

export function classifyProviderError(err) {
  const raw = String(err?.message || err || '').toLowerCase()
  if (!raw) return ProviderErrorCode.UNKNOWN
  if (raw.includes('session') || raw.includes('expired') || raw.includes('abgelaufen')) return ProviderErrorCode.SESSION
  if (raw.includes('auth') || raw.includes('token') || raw.includes('unlogged')) return ProviderErrorCode.AUTH
  if (raw.includes('nomoney') || raw.includes('insufficient') || raw.includes('guthaben')) return ProviderErrorCode.INSUFFICIENT_BALANCE
  if (raw.includes('429') || raw.includes('rate') || raw.includes('too many')) return ProviderErrorCode.RATE_LIMIT
  if (
    raw.includes('timeout') ||
    raw.includes('network') ||
    raw.includes('fetch') ||
    raw.includes('econn') ||
    raw.includes('internal server error') ||
    raw.includes('http 500') ||
    raw.includes('http 502') ||
    raw.includes('http 503')
  ) return ProviderErrorCode.TRANSIENT
  if (raw.includes('invalid') || raw.includes('err_val') || raw.includes('ungültig')) return ProviderErrorCode.VALIDATION
  return ProviderErrorCode.UNKNOWN
}

export function normalizeProviderError(providerId, err, fallbackMessage = 'Provider-Fehler') {
  const code = classifyProviderError(err)
  const message = String(err?.message || fallbackMessage || 'Provider-Fehler')
  const out = new Error(message)
  out.providerId = providerId
  out.providerErrorCode = code
  out.retryable = RETRYABLE_CODES.has(code)
  out.userMessage = getProviderUserMessage(code, message)
  if (err?.sessionClosed || code === ProviderErrorCode.SESSION) out.sessionClosed = true
  if (err?.insufficientBalance || code === ProviderErrorCode.INSUFFICIENT_BALANCE) out.insufficientBalance = true
  out.cause = err
  return out
}

export function getProviderUserMessage(code, message) {
  switch (code) {
    case ProviderErrorCode.AUTH:
      return 'Authentifizierung fehlgeschlagen. Bitte Session neu starten.'
    case ProviderErrorCode.SESSION:
      return 'Session ist abgelaufen. Bitte Session neu starten.'
    case ProviderErrorCode.INSUFFICIENT_BALANCE:
      return 'Nicht genügend Guthaben für diesen Spin.'
    case ProviderErrorCode.RATE_LIMIT:
      return 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.'
    case ProviderErrorCode.TRANSIENT:
      return 'Temporärer Netzwerkfehler. Bitte erneut versuchen.'
    case ProviderErrorCode.VALIDATION:
      return 'Ungültige Anfrage oder ungültiger Einsatz.'
    default:
      return message || 'Unbekannter Provider-Fehler.'
  }
}

