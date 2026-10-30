import { useMemo } from 'react'
import { useAutoBetStore } from '../store/autoBetStore'
import { useCopyBetStore } from '../store/copyBetStore'
import { isWorkspaceSessionActive, useWorkspaceSessionStore, type WorkspaceSession } from '../store/workspaceSessionStore'

/** Combine direct Sports state with display adapters; never persist or control an engine. */
export function useWorkspaceSessions() {
  const published = useWorkspaceSessionStore((state) => state.sessions)
  const autoRunning = useAutoBetStore((state) => state.isRunning)
  const autoCurrency = useAutoBetStore((state) => state.settings.currency)
  const lastAutoScan = useAutoBetStore((state) => state.lastScanAt)
  const copyRunning = useCopyBetStore((state) => state.isRunning)
  const copyCurrency = useCopyBetStore((state) => state.settings.currency)
  const copyScanOnly = useCopyBetStore((state) => state.settings.scanOnly)

  return useMemo(() => {
    const sessions: WorkspaceSession[] = Object.values(published).filter((session) => session.source !== 'autobet' && session.source !== 'copy')
    if (autoRunning) {
      sessions.push({
        id: 'sports-autobet', source: 'autobet', label: 'Sports AutoBet', state: 'running',
        updatedAt: 0, currency: autoCurrency,
        detail: lastAutoScan ? `Last scan ${new Date(lastAutoScan).toLocaleTimeString()}` : 'Waiting for the first scan.',
        destination: { view: 'sports', sportsTab: 'settings' },
      })
    }
    if (copyRunning) {
      sessions.push({
        id: 'sports-copy', source: 'copy', label: 'Sports Copy', state: 'running',
        updatedAt: 0, currency: copyCurrency,
        detail: copyScanOnly ? 'Scan only: matching feed bets without copying.' : 'Copy feed enabled.',
        destination: { view: 'sports', sportsTab: 'copy' },
      })
    }
    const priority: Record<WorkspaceSession['state'], number> = { error: 0, running: 1, waiting: 2, paused: 3, stopped: 4 }
    sessions.sort((a, b) => priority[a.state] - priority[b.state] || b.updatedAt - a.updatedAt || a.label.localeCompare(b.label))
    const activeSessions = sessions.filter(isWorkspaceSessionActive)
    return { sessions, activeSessions, activeCount: activeSessions.length, errorCount: sessions.filter((session) => session.state === 'error').length }
  }, [published, autoRunning, autoCurrency, lastAutoScan, copyRunning, copyCurrency, copyScanOnly])
}
