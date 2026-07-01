/**
 * Script-Mode: thin wrapper around betShareIdRegistry (providerBetId ↔ house share-iid).
 */

import { betShareIdRegistry } from '../../../utils/betShareIdRegistry'
import { isPersistableStakeHouseBetShareId } from '../../../utils/stakeBetShareId.js'

export type ScriptHouseBetPending = {
  betIndex: number
  at: number
  betApiId?: string
  /** Nur für Debug/Logs. */
  game?: string
}

export type ScriptHouseBetIdBridge = {
  registerPending: (p: ScriptHouseBetPending) => void
  linkBetApiId: (betIndex: number, betApiId: string | undefined | null) => void
  getShareId: (betIndex: number) => string | null
  dispose: () => void
}

export function createScriptHouseBetIdBridge(
  accessToken: string | undefined,
  onResolved?: (betIndex: number, betId: string) => void
): ScriptHouseBetIdBridge {
  const token = accessToken?.trim() || ''
  if (token) betShareIdRegistry.ensureListening(token)

  return {
    registerPending(p: ScriptHouseBetPending) {
      betShareIdRegistry.register({
        betIndex: p.betIndex,
        at: p.at || Date.now(),
        providerBetId: p.betApiId,
        onResolved,
      })
    },
    linkBetApiId(betIndex: number, betApiId: string | undefined | null) {
      betShareIdRegistry.linkApiId(betIndex, betApiId)
    },
    getShareId(betIndex: number) {
      return betShareIdRegistry.getShareIdByBetIndex(betIndex)
    },
    dispose() {
      if (token) betShareIdRegistry.releaseListening(token)
    },
  }
}

/** Share-ID für Script-Bet-Liste (house:… oder casino:uuid). */
export function isScriptDisplayableBetShareId(id: string | null | undefined): boolean {
  if (!id) return false
  return isPersistableStakeHouseBetShareId(String(id).trim())
}
