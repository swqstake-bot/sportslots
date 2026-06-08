import { useEffect } from 'react'
import { SESSION_ONLY_CASINO_BETS } from '../../../config/sessionData'
import { clearAllBetHistory, clearBetHistoryAudit } from './betHistoryDb'
import { resetChallengeHubRecentBets } from './challengeHubLiveFeed'
import { clearHubHouseBetRetryBuffer } from './challengeHubBetIdPatch'
import { clearTopEntries } from './topDomain'

export const CASINO_BET_SESSION_CLEAR_EVENT = 'casino-bet-session-clear'

const SCRIPT_SESSION_STORAGE_KEYS = [
  'originals_script_session',
  'originals_script_bet_list',
  'originals_script_bets',
] as const

function purgeScriptSessionStorage(): void {
  try {
    for (const key of SCRIPT_SESSION_STORAGE_KEYS) {
      sessionStorage.removeItem(key)
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

/** IndexedDB + Hub-Feed + UI-Listener — gesamter Casino-Bereich. */
export async function clearCasinoBetSession(): Promise<void> {
  if (!SESSION_ONLY_CASINO_BETS) return

  purgeScriptSessionStorage()

  await Promise.all([
    clearAllBetHistory().catch(() => {}),
    Promise.resolve().then(() => clearBetHistoryAudit()),
  ])

  resetChallengeHubRecentBets()
  clearHubHouseBetRetryBuffer()
  clearTopEntries()

  try {
    window.dispatchEvent(new CustomEvent(CASINO_BET_SESSION_CLEAR_EVENT))
  } catch {
    /* ignore */
  }
}

/** In-memory Bet-Listen in Unterkomponenten leeren (Slots, Originals, Script, …). */
export function useCasinoBetListReset(clear: () => void): void {
  useEffect(() => {
    if (!SESSION_ONLY_CASINO_BETS) return
    const handler = () => clear()
    window.addEventListener(CASINO_BET_SESSION_CLEAR_EVENT, handler)
    return () => window.removeEventListener(CASINO_BET_SESSION_CLEAR_EVENT, handler)
  }, [clear])
}

/** Einmal beim Casino-Mount leeren; beim App-Schließen / Unmount erneut. */
export function useCasinoBetSessionLifecycle(onCleared?: () => void): void {
  useEffect(() => {
    if (!SESSION_ONLY_CASINO_BETS) return

    void clearCasinoBetSession().then(() => onCleared?.())

    const onLeave = () => {
      void clearCasinoBetSession().then(() => onCleared?.())
    }
    window.addEventListener('pagehide', onLeave)

    return () => {
      window.removeEventListener('pagehide', onLeave)
      void clearCasinoBetSession().then(() => onCleared?.())
    }
  }, [onCleared])
}
