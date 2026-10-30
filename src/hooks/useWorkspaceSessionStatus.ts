import { useEffect } from 'react'
import { publishWorkspaceSession, removeWorkspaceSession, type WorkspaceSession } from '../store/workspaceSessionStore'

type Status = Omit<WorkspaceSession, 'id' | 'updatedAt' | 'state'> & { state: WorkspaceSession['state'] | null }

/** Publish display state only. No run controls, timers or persisted engine state. */
export function useWorkspaceSessionStatus(id: string, { source, label, state, currency, detail, destination }: Status) {
  const { view, casinoMode, sportsTab, hubTab, promotionsTab, slotInstanceId } = destination
  useEffect(() => {
    if (!state) {
      removeWorkspaceSession(id)
      return
    }
    publishWorkspaceSession({ id, source, label, state, currency, detail, destination: { view, casinoMode, sportsTab, hubTab, promotionsTab, slotInstanceId }, updatedAt: Date.now() })
  }, [id, source, label, state, currency, detail, view, casinoMode, sportsTab, hubTab, promotionsTab, slotInstanceId])
  useEffect(() => () => removeWorkspaceSession(id), [id])
}
