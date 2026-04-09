import { normalizeProviderError } from './providerErrors'
import { getProviderCapabilities } from '../../constants/providers'
import { createEventEnvelope } from '../../../../utils/eventEnvelope'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const providerSessionState = new Map()

function buildProviderSessionKey(providerId, contextKey = 'default') {
  return `${String(providerId || 'unknown')}::${String(contextKey || 'default')}`
}

export function setProviderSessionState(providerId, state, contextKey = 'default') {
  const key = buildProviderSessionKey(providerId, contextKey)
  providerSessionState.set(key, {
    providerId,
    state,
    contextKey,
    updatedAt: new Date().toISOString(),
  })
}

export function getProviderSessionState(providerId, contextKey = 'default') {
  const key = buildProviderSessionKey(providerId, contextKey)
  return providerSessionState.get(key) || null
}

function emitProviderRuntimeEvent(type, payload) {
  try {
    const envelope = createEventEnvelope(`provider.${type}`, payload)
    window.dispatchEvent(new CustomEvent('sportslots-provider-runtime', { detail: envelope }))
  } catch (_) {}
}

export async function executeProviderMethod(providerId, methodName, fn) {
  const caps = getProviderCapabilities(providerId)
  const retryProfile = caps?.retryProfile || { maxAttempts: 1, baseDelayMs: 0 }
  const maxAttempts = Math.max(1, Number(retryProfile.maxAttempts || 1))
  const baseDelayMs = Math.max(0, Number(retryProfile.baseDelayMs || 0))

  let attempt = 0
  setProviderSessionState(providerId, 'running')
  emitProviderRuntimeEvent('method-start', { providerId, methodName, maxAttempts })
  while (attempt < maxAttempts) {
    try {
      const result = await fn()
      setProviderSessionState(providerId, 'ok')
      emitProviderRuntimeEvent('method-success', { providerId, methodName, attempt: attempt + 1 })
      return result
    } catch (err) {
      const normalized = normalizeProviderError(providerId, err, `${providerId}/${methodName} failed`)
      attempt += 1
      emitProviderRuntimeEvent('method-error', {
        providerId,
        methodName,
        attempt,
        retryable: !!normalized.retryable,
        code: normalized.providerErrorCode || 'unknown',
        message: normalized.message,
      })
      if (!normalized.retryable || attempt >= maxAttempts) {
        setProviderSessionState(providerId, 'failed')
        throw normalized
      }
      setProviderSessionState(providerId, 'retrying')
      const delay = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
      if (delay > 0) await sleep(delay)
    }
  }
  setProviderSessionState(providerId, 'failed')
  throw normalizeProviderError(providerId, new Error(`${providerId}/${methodName} failed`))
}

