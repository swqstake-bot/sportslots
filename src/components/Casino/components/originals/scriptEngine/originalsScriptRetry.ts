/** Delay before retrying transient Originals script API errors (502, network, …). */
export const ORIGINALS_SCRIPT_RETRY_DELAY_MS = 3000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function isRetryableOriginalsScriptError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error || '').toLowerCase()
  if (!msg) return false
  if (msg.includes('abgebrochen') || msg.includes('cancelled')) return false
  if (msg.includes('session rejected') || msg.includes('login window')) return false
  if (msg.includes('insufficient') || msg.includes('nomoney') || msg.includes('not enough')) return false
  if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('429')) return true
  if (msg.includes('antwortete nicht mit json')) return true
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch')) return true
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout')) return true
  if (msg.includes('stake-casino-rest-post') && (msg.includes('502') || msg.includes('503') || msg.includes('504'))) {
    return true
  }
  return false
}

/**
 * Retries until success, manual cancel, or a non-retryable error.
 */
export async function withOriginalsScriptRetry<T>(
  task: () => Promise<T>,
  opts: {
    signal?: { cancelled: boolean }
    onLog?: (msg: string) => void
    label?: string
  } = {}
): Promise<T> {
  const { signal, onLog, label = 'API' } = opts
  let attempt = 0
  while (true) {
    if (signal?.cancelled) throw new Error('Abgebrochen')
    attempt++
    try {
      return await task()
    } catch (error) {
      if (!isRetryableOriginalsScriptError(error) || signal?.cancelled) throw error
      const msg = error instanceof Error ? error.message : String(error)
      onLog?.(`${label}: ${msg.slice(0, 100)} — retry in 3s…`)
      await sleep(ORIGINALS_SCRIPT_RETRY_DELAY_MS)
    }
  }
}
