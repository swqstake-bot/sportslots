import { create } from 'zustand'
import type { WorkspaceDestination } from '../components/AppShell/workspaceNavigation'

export type WorkspaceSessionState = 'running' | 'waiting' | 'paused' | 'stopped' | 'error'
export type WorkspaceSessionSource = 'slots' | 'originals' | 'hunter' | 'telegram' | 'balance' | 'bonus-hunt' | 'autobet' | 'copy'

/** Display-only state. Engines retain ownership of all run controls and lifecycle. */
export interface WorkspaceSession {
  id: string
  source: WorkspaceSessionSource
  label: string
  state: WorkspaceSessionState
  /** Time this status was reported; not a bet timestamp or a live-data guarantee. */
  updatedAt: number
  currency?: string
  detail?: string
  destination: WorkspaceDestination
}

interface WorkspaceSessionStore {
  sessions: Record<string, WorkspaceSession>
}

export const useWorkspaceSessionStore = create<WorkspaceSessionStore>(() => ({ sessions: {} }))

export function publishWorkspaceSession(session: WorkspaceSession): void {
  if (!session.id || !Number.isFinite(session.updatedAt)) return
  useWorkspaceSessionStore.setState((current) => {
    const previous = current.sessions[session.id]
    if (
      previous && previous.source === session.source && previous.label === session.label &&
      previous.state === session.state && previous.updatedAt === session.updatedAt &&
      previous.currency === session.currency && previous.detail === session.detail &&
      previous.destination.view === session.destination.view &&
      previous.destination.casinoMode === session.destination.casinoMode &&
      previous.destination.sportsTab === session.destination.sportsTab &&
      previous.destination.hubTab === session.destination.hubTab &&
      previous.destination.promotionsTab === session.destination.promotionsTab &&
      previous.destination.slotInstanceId === session.destination.slotInstanceId
    ) return current
    return { sessions: { ...current.sessions, [session.id]: { ...session, destination: { ...session.destination } } } }
  })
}

export function removeWorkspaceSession(id: string): void {
  useWorkspaceSessionStore.setState((current) => {
    if (!(id in current.sessions)) return current
    const sessions = { ...current.sessions }
    delete sessions[id]
    return { sessions }
  })
}

export function isWorkspaceSessionActive(session: WorkspaceSession): boolean {
  return session.state === 'running' || session.state === 'waiting' || session.state === 'paused'
}
