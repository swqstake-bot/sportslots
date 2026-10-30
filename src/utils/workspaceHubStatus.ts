import type { HubStatsPayload } from '../components/Casino/components/challengeHub/hubTypes'
import { publishWorkspaceSession, useWorkspaceSessionStore } from '../store/workspaceSessionStore'

/** Adapter only: it describes the existing hunters without controlling them. */
export function reportHubWorkspaceStatus(payload: HubStatsPayload): void {
  const source = payload.source === 'casino' ? 'hunter' : payload.source === 'autorun' ? 'balance' : payload.source === 'telegram' ? 'telegram' : null
  if (!source) return
  const id = `casino-${source}`
  const previous = useWorkspaceSessionStore.getState().sessions[id]
  const state = payload.running > 0 ? 'running' : payload.queued > 0 ? 'waiting' : (payload.failed || 0) > 0 ? 'error' : 'stopped'
  const detail = `${payload.running} running · ${payload.queued} queued${payload.failed ? ` · ${payload.failed} failed` : ''}`
  if ((!previous && state === 'stopped') || (previous?.state === state && previous.detail === detail)) return
  publishWorkspaceSession({ id, source, state, detail,
    label: source === 'hunter' ? 'Challenge Hunter' : source === 'balance' ? 'Balance rules' : 'Telegram Hunter',
    updatedAt: payload.ts || Date.now(),
    destination: { view: 'casino', casinoMode: source === 'telegram' ? 'promotions' : 'challengeHub',
      ...(source === 'telegram' ? { promotionsTab: 'telegram' } : { hubTab: source === 'balance' ? 'autorun' : 'casino' }),
    },
  })
}
