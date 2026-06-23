/**
 * Serialisiert StakeCruncher-HTTP mit Abstand + Retry bei Rate-Limit / Überlastung.
 * 404 = Spiel nicht auf Cruncher · 429/503 = zu schnell / Server busy (retry).
 */

const MIN_GAP_MS = 500
const MAX_RETRIES = 4
const RETRY_BASE_MS = 1500

let lastRequestAt = 0
let chain = Promise.resolve()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function cruncherHttpStatusFromError(err) {
  if (err && typeof err.status === 'number') return err.status
  const msg = err instanceof Error ? err.message : String(err || '')
  const m = msg.match(/StakeCruncher HTTP (\d+)/)
  return m ? Number(m[1]) : 0
}

export function isCruncherRetryableStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504
}

export function isCruncherNotFoundStatus(status) {
  return status === 404
}

export function isCruncherRateOrOverloadError(err) {
  return isCruncherRetryableStatus(cruncherHttpStatusFromError(err))
}

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function enqueueCruncherRequest(task) {
  const run = async () => {
    const gap = MIN_GAP_MS - (Date.now() - lastRequestAt)
    if (gap > 0) await sleep(gap)

    let lastErr = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        lastRequestAt = Date.now()
        return await task()
      } catch (err) {
        lastErr = err
        const status = cruncherHttpStatusFromError(err)
        if (!isCruncherRetryableStatus(status) || attempt >= MAX_RETRIES) throw err
        const waitMs = RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 400)
        console.warn(
          `[StakeCruncher] HTTP ${status} — retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`
        )
        await sleep(waitMs)
      }
    }
    throw lastErr
  }

  const result = chain.then(run, run)
  chain = result.catch(() => {})
  return result
}
