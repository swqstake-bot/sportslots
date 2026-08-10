import { useCallback, useMemo, useState } from 'react'

import './originals-workbench.css'
import DiceRunnerTab from '../DiceRunnerTab'
import AutoWagerGcPanel from '../autoWagerGc/AutoWagerGcPanel'

import OriginalsScriptView from '../OriginalsScriptView'

import { getOriginalsGame } from '../registry/originalsRegistry'

import type { OriginalsWorkbenchOptions, OriginalsBettingMode } from '../schema/workbenchOptions'

import { DEFAULT_WORKBENCH_OPTIONS } from '../schema/workbenchOptions'

import { useOriginalsSession } from '../hooks/useOriginalsSession'
import { useUserStore } from '../../../../../store/userStore'
import { useStakeSiteStore } from '../../../../../store/stakeSiteStore'

import OriginalsAutomaticPanel from './OriginalsAutomaticPanel'

import OriginalsConditionsPanel from './OriginalsConditionsPanel'
import OriginalsModeHeader from './OriginalsModeHeader'

import OriginalsSettingsModal from './OriginalsSettingsModal'

import OriginalsStatsDrawer from './OriginalsStatsDrawer'
import OriginalsLogDock from './OriginalsLogDock'
import OriginalsSidebar from './OriginalsSidebar'
import OriginalsBetBrowser from './OriginalsBetBrowser'
import OriginalsLastResultVisual, { betRowToVisual } from './OriginalsLastResultVisual'
import ActiveTargetSummary from './ActiveTargetSummary'

import {
  loadBettingMode,
  loadProfilesOnStart,
  loadWorkbenchSettings,
  saveBettingMode,
  loadStatsDrawerOpen,
  saveStatsDrawerOpen,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
  loadLogDockOpen,
  saveLogDockOpen,
  saveWorkbenchSettings,
  getBetListColumns,
  type WorkbenchSettings,
} from './workbenchStorage'
import { loadProfiles } from '../profileStorage'
import { isTurboCompatibleGame } from '../engine/turboConfig'

interface OriginalsWorkbenchProps {
  gameSlug: string
  onBack: () => void
  accessToken?: string
}

function normalizeModeForGame(
  mode: OriginalsBettingMode,
  slug: string,
  _gameEntry: ReturnType<typeof getOriginalsGame>
): OriginalsBettingMode {
  if (mode === 'dice-runner' && slug !== 'dice') return 'automatic'
  if (mode === 'conditions' && slug !== 'dice') return 'automatic'
  return mode
}

function loadWorkbenchSettingsForGame(slug: string): WorkbenchSettings {
  const settings = loadWorkbenchSettings()
  if (!isTurboCompatibleGame(slug) && settings.turboMode) {
    const next = { ...settings, turboMode: false }
    saveWorkbenchSettings(next)
    return next
  }
  return settings
}

export default function OriginalsWorkbench({ gameSlug, onBack, accessToken }: OriginalsWorkbenchProps) {
  const game = getOriginalsGame(gameSlug)
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const [mode, setMode] = useState<OriginalsBettingMode>(() =>
    normalizeModeForGame(loadBettingMode(), gameSlug, getOriginalsGame(gameSlug))
  )
  const [statsOpen, setStatsOpen] = useState(loadStatsDrawerOpen)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [logOpen, setLogOpen] = useState(loadLogDockOpen)
  const [wbSettings, setWbSettings] = useState<WorkbenchSettings>(() => loadWorkbenchSettingsForGame(gameSlug))
  const [autoOptions, setAutoOptions] = useState<OriginalsWorkbenchOptions>(() => {
    const settings = loadWorkbenchSettings()
    const base: OriginalsWorkbenchOptions = {
      ...DEFAULT_WORKBENCH_OPTIONS,
      game: gameSlug,
      requestInterval: settings.requestInterval,
    }
    // Try to load strategyId from URL query param on first mount
    try {
      const params = new URLSearchParams(window.location.search)
      const strategyId = params.get('strategyId') || params.get('strategyid')
      if (strategyId) {
        const profiles = loadProfiles(gameSlug)
        const match = profiles.find(
          (p) => p.name === strategyId || p.name.toLowerCase() === strategyId.toLowerCase()
        )
        if (match?.options) return { ...base, ...match.options, game: gameSlug }
      }
    } catch {
      /* ignore */
    }
    if (loadProfilesOnStart()) {
      const profile = loadProfiles(gameSlug).find((p) => p.loadOnStart)
      if (profile?.options) return { ...base, ...profile.options, game: gameSlug }
    }
    return base
  })

  const resolvedAutoOptions = useMemo(
    () => ({ ...autoOptions, game: gameSlug }),
    [autoOptions, gameSlug]
  )

  const session = useOriginalsSession(accessToken, wbSettings)

  const automaticLastResult = useMemo(() => {
    const row = session.betList[0]
    if (!row) return null
    const visual = betRowToVisual(row)
    if (gameSlug.toLowerCase() === 'hilo') {
      visual.hiloRank = autoOptions.startCardRank?.trim() || undefined
      visual.hiloSuit = (autoOptions.startCardSuit ?? '').toUpperCase().slice(0, 1) || undefined
    }
    return visual
  }, [session.betList, gameSlug, autoOptions.startCardRank, autoOptions.startCardSuit])

  const handleModeChange = useCallback(
    (next: OriginalsBettingMode) => {
      if (session.running) return
      setMode(next)
      saveBettingMode(next)
    },
    [session.running]
  )

  const toggleStats = useCallback(() => {
    setStatsOpen((open) => {
      const next = !open
      saveStatsDrawerOpen(next)
      return next
    })
  }, [])

  const applySettings = useCallback((next: WorkbenchSettings) => {
    saveWorkbenchSettings(next)
    setWbSettings(next)

    setAutoOptions((o) => ({
      ...o,
      requestInterval: next.requestInterval,
    }))
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      saveSidebarCollapsed(next)
      return next
    })
  }, [])

  const toggleLog = useCallback(() => {
    setLogOpen((prev) => {
      const next = !prev
      saveLogDockOpen(next)
      return next
    })
  }, [])

  const toggleTurbo = useCallback(() => {
    if (session.running || !isTurboCompatibleGame(gameSlug)) return
    setWbSettings((prev) => {
      const next = { ...prev, turboMode: !prev.turboMode }
      saveWorkbenchSettings(next)
      return next
    })
  }, [session.running, gameSlug])

  const handleCurrencyChange = useCallback((currency: string) => {
    useUserStore.getState().setSelectedCurrency(currency)
    setWbSettings((prev) => {
      const next = { ...prev, currency }
      saveWorkbenchSettings(next)
      return next
    })
  }, [])

  if (!game) {
    return (
      <div className="casino-card p-4">
        <p className="text-sm text-red-400">Unknown game: {gameSlug}</p>
        <button type="button" className="originals-back-btn mt-2" onClick={onBack}>
          ← Games
        </button>
      </div>
    )
  }

  const showDiceRunner = mode === 'dice-runner' && game.slug === 'dice'
  const showCode = mode === 'code'
  const showAutomatic = mode === 'automatic'
  const showConditions = mode === 'conditions' && game.slug === 'dice'
  const showSidebar = showAutomatic || showConditions
  const centerLastResult = showAutomatic ? automaticLastResult : null

  const showBetHistory = (showAutomatic || showConditions) && wbSettings.showBetList
  const showSessionLog = showAutomatic || showConditions
  const statsVisible = statsOpen && wbSettings.showStatsPanel
  const turboOk = isTurboCompatibleGame(gameSlug)
  // Code / Dice Runner have no sidebar — still force single-column grid, otherwise
  // main content sits in the empty sidebar track and looks pinned to the left.
  const singleColumnBody = !showSidebar || sidebarCollapsed

  return (
    <div
      className={`originals-workbench${statsVisible ? ' has-stats-open' : ''}${wbSettings.statsFloating ? ' has-stats-float' : ''}${singleColumnBody ? ' is-sidebar-collapsed' : ''}${logOpen && showSessionLog ? ' has-log-open' : ''}`}
      style={{ ['--originals-sidebar-w' as string]: `${wbSettings.sidebarWidth}px` }}
    >
      <OriginalsModeHeader
        game={game}
        mode={mode}
        running={session.running}
        onModeChange={handleModeChange}
        onBack={onBack}
        statsOpen={statsVisible}
        onToggleStats={toggleStats}
        onOpenSettings={openSettings}
        currency={wbSettings.currency}
        onCurrencyChange={handleCurrencyChange}
        currencyDisabled={session.running}
        accessToken={accessToken}
        turboMode={wbSettings.turboMode}
        turboCompatible={turboOk}
        onToggleTurbo={toggleTurbo}
        showSidebarToggle={showSidebar}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        logOpen={showSessionLog ? logOpen : false}
        onToggleLog={showSessionLog ? toggleLog : undefined}
      />

      <div className="originals-workbench-canvas">
        <div className="originals-workbench-body">
        {showSidebar && (
          <OriginalsSidebar
            gameSlug={gameSlug}
            options={resolvedAutoOptions}
            onChange={setAutoOptions}
            onLoadProfile={(opts) => setAutoOptions({ ...opts, game: gameSlug })}
            supportsCombo={game.supportsCombo}
            gameUiReady={game.uiReady}
            disabled={session.running}
            sidebarWidth={wbSettings.sidebarWidth}
            currency={wbSettings.currency}
          />
        )}

        <main className="originals-workbench-main">
          {showAutomatic && (
            <div className="originals-center-stage">
              <OriginalsLastResultVisual
                result={centerLastResult}
                gameSlug={gameSlug}
                idleHint="Start betting — the latest result appears here."
              />

              <ActiveTargetSummary
                gameSlug={gameSlug}
                options={resolvedAutoOptions}
                currency={wbSettings.currency}
              />
            </div>
          )}

          {showDiceRunner && (
            <>
              <div className="originals-legacy-banner">
                <strong>Legacy Dice Runner.</strong> Prefer Automatic → Strategy → Advanced strategy →
                Hunt→Moonshot preset (same idea, unified with Combo/B2B).
              </div>
              <DiceRunnerTab />
            </>
          )}

          {showCode && (
            <div className="originals-code-panel">
              <OriginalsScriptView />
            </div>
          )}

          {showAutomatic && (
            <div className="casino-card originals-automatic-card">
              <OriginalsAutomaticPanel
                options={resolvedAutoOptions}
                currency={wbSettings.currency}
                session={session}
                turboMode={wbSettings.turboMode && turboOk}
              />
            </div>
          )}

          {game.slug === 'dice' && preferredSite === 'eu' && <AutoWagerGcPanel />}

          {showBetHistory && (
            <OriginalsBetBrowser
              betList={session.betList}
              maxRows={wbSettings.betListMaxEntries}
              columns={getBetListColumns(wbSettings, gameSlug)}
            />
          )}

          {showConditions && (
            <OriginalsConditionsPanel
              gameSlug={gameSlug}
              options={resolvedAutoOptions}
              onChange={setAutoOptions}
              currency={wbSettings.currency}
              session={session}
            />
          )}
        </main>

        <OriginalsStatsDrawer
          open={statsVisible}
          onClose={() => toggleStats()}
          onReset={session.resetStats}
          running={session.running}
          chartData={session.chartData}
          chartSessionKey={session.chartSessionKey}
          stats={session.stats}
          floating={wbSettings.statsFloating}
        />

        {showSessionLog && (
          <OriginalsLogDock
            open={logOpen}
            onToggle={toggleLog}
            logLines={session.logLines}
            running={session.running}
          />
        )}
        </div>
      </div>

      <OriginalsSettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        settings={wbSettings}
        onChange={applySettings}
      />
    </div>
  )
}
