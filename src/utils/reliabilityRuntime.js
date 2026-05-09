import { createEventEnvelope, generateCorrelationId } from './eventEnvelope'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isRetryableRuntimeError(error) {
  const msg = String(error?.message || '').toLowerCase()
  if (!msg) return false
  if (msg.includes('timeout')) return true
  if (msg.includes('network')) return true
  if (msg.includes('failed to fetch')) return true
  if (msg.includes('econnreset') || msg.includes('econnrefused')) return true
  if (msg.includes('429')) return true
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true
  return false
}

function emitReliabilityEvent(type, payload, correlationId) {
  try {
    const envelope = createEventEnvelope(`reliability.${type}`, payload, correlationId)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sportslots-reliability', { detail: envelope }))
    }
  } catch {
  }
}

export async function executeWithReliability({
  domain = 'runtime',
  action = 'action',
  task,
  maxAttempts = 1,
  baseDelayMs = 0,
  isRetryable = isRetryableRuntimeError,
  correlationId,
}) {
  const corr = correlationId || generateCorrelationId('reliability')
  const attemptsMax = Math.max(1, Number(maxAttempts) || 1)
  const delayBase = Math.max(0, Number(baseDelayMs) || 0)
  const startedAt = Date.now()
  emitReliabilityEvent('start', { domain, action, maxAttempts: attemptsMax }, corr)
  let attempt = 0
  while (attempt < attemptsMax) {
    attempt += 1
    try {
      const result = await task()
      emitReliabilityEvent(
        'success',
        { domain, action, attempt, durationMs: Date.now() - startedAt, retriesUsed: Math.max(0, attempt - 1) },
        corr
      )
      return { result, attempts: attempt, correlationId: corr }
    } catch (error) {
      const retryable = Boolean(isRetryable?.(error))
      emitReliabilityEvent(
        'attempt-error',
        {
          domain,
          action,
          attempt,
          retryable,
          error: String(error?.message || error || 'unknown error'),
        },
        corr
      )
      if (!retryable || attempt >= attemptsMax) {
        emitReliabilityEvent(
          'failed',
          {
            domain,
            action,
            attempt,
            durationMs: Date.now() - startedAt,
            error: String(error?.message || error || 'unknown error'),
          },
          corr
        )
        throw error
      }
      const delayMs = delayBase * Math.pow(2, Math.max(0, attempt - 1))
      if (delayMs > 0) await sleep(delayMs)
    }
  }
  throw new Error(`${domain}/${action} failed`)
}
