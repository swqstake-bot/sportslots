/**
 * OriginalsView — Workbench (Dashboard + Game Page).
 */

import { useCallback, useState } from 'react'
import type { OriginalsGameEntry } from './originals/registry/originalsRegistry'
import OriginalsGameDashboard from './originals/workbench/OriginalsGameDashboard'
import OriginalsWorkbench from './originals/workbench/OriginalsWorkbench'
import { loadSelectedGame, saveSelectedGame } from './originals/workbench/workbenchStorage'

interface OriginalsViewProps {
  accessToken?: string
}

export default function OriginalsView({ accessToken }: OriginalsViewProps) {
  const [view, setView] = useState<'dashboard' | 'game'>('dashboard')
  const [selectedSlug, setSelectedSlug] = useState(() => loadSelectedGame())

  const openGame = useCallback((game: OriginalsGameEntry) => {
    setSelectedSlug(game.slug)
    saveSelectedGame(game.slug)
    setView('game')
  }, [])

  const backToDashboard = useCallback(() => {
    setView('dashboard')
  }, [])

  if (view === 'dashboard') {
    return <OriginalsGameDashboard selectedSlug={selectedSlug} onSelect={openGame} />
  }

  return <OriginalsWorkbench key={selectedSlug} gameSlug={selectedSlug} onBack={backToDashboard} accessToken={accessToken} />
}
