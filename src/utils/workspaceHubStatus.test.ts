import { beforeEach, describe, expect, it } from 'vitest'
import { reportHubWorkspaceStatus } from './workspaceHubStatus'
import { publishWorkspaceSession, removeWorkspaceSession, useWorkspaceSessionStore } from '../store/workspaceSessionStore'
import type { HubStatsPayload } from '../components/Casino/components/challengeHub/hubTypes'

const snapshot = (patch: Partial<HubStatsPayload> = {}): HubStatsPayload => ({ source: 'casino', running: 0, queued: 0, completed: 0, bestMulti: 0, ts: 1000, ...patch })

beforeEach(() => useWorkspaceSessionStore.setState({ sessions: {} }))

describe('workspace status reporting', () => {
  it('keeps a failed start visible for review instead of reporting it as stopped', () => {
    reportHubWorkspaceStatus(snapshot({ failed: 1 }))
    expect(useWorkspaceSessionStore.getState().sessions['casino-hunter']).toMatchObject({ state: 'error', detail: '0 running · 0 queued · 1 failed', destination: { casinoMode: 'challengeHub', hubTab: 'casino' } })
  })

  it('keeps waiting work visible without expiring its last reported state', () => {
    reportHubWorkspaceStatus(snapshot({ source: 'autorun', queued: 2, ts: 1 }))
    const session = useWorkspaceSessionStore.getState().sessions['casino-balance']
    expect(session).toMatchObject({ state: 'waiting', updatedAt: 1, destination: { casinoMode: 'challengeHub', hubTab: 'autorun' } })
    reportHubWorkspaceStatus(snapshot({ source: 'autorun', queued: 2, ts: 900000 }))
    expect(useWorkspaceSessionStore.getState().sessions['casino-balance']).toBe(session)
  })

  it('opens Telegram directly and ignores unrecognized sources and initial idle panels', () => {
    reportHubWorkspaceStatus(snapshot())
    reportHubWorkspaceStatus(snapshot({ source: 'unsupported', running: 1 }))
    expect(Object.keys(useWorkspaceSessionStore.getState().sessions)).toHaveLength(0)
    reportHubWorkspaceStatus(snapshot({ source: 'telegram', running: 1 }))
    expect(useWorkspaceSessionStore.getState().sessions['casino-telegram'].destination).toEqual({ view: 'casino', casinoMode: 'promotions', promotionsTab: 'telegram' })
  })

  it('reports a completed stop only after the source reports no running or queued work', () => {
    reportHubWorkspaceStatus(snapshot({ running: 1 }))
    reportHubWorkspaceStatus(snapshot({ queued: 3 }))
    expect(useWorkspaceSessionStore.getState().sessions['casino-hunter'].state).toBe('waiting')
    reportHubWorkspaceStatus(snapshot({ completed: 4 }))
    expect(useWorkspaceSessionStore.getState().sessions['casino-hunter'].state).toBe('stopped')
  })

  it('retains the exact slot destination and removes only the requested session', () => {
    const base = { id: 'slot-a', source: 'slots' as const, label: 'A', state: 'running' as const, updatedAt: 1 }
    publishWorkspaceSession({ ...base, destination: { view: 'casino', casinoMode: 'play', slotInstanceId: 'a' } })
    publishWorkspaceSession({ ...base, destination: { view: 'casino', casinoMode: 'play', slotInstanceId: 'b' } })
    expect(useWorkspaceSessionStore.getState().sessions['slot-a'].destination.slotInstanceId).toBe('b')
    reportHubWorkspaceStatus(snapshot({ running: 1 }))
    removeWorkspaceSession('slot-a')
    expect(Object.keys(useWorkspaceSessionStore.getState().sessions)).toEqual(['casino-hunter'])
  })
})
