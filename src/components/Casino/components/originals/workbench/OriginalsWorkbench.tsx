import { useCallback, useMemo, useState } from 'react'

import './originals-workbench.css'
import DiceRunnerTab from '../DiceRunnerTab'

import OriginalsScriptView from '../OriginalsScriptView'

import { getOriginalsGame } from '../registry/originalsRegistry'

import type { OriginalsWorkbenchOptions, OriginalsBettingMode } from '../schema/workbenchOptions'

import { DEFAULT_WORKBENCH_OPTIONS } from '../schema/workbenchOptions'

import { useOriginalsSession } from '../hooks/useOriginalsSession'
import { useUserStore } from '../../../../../store/userStore'

import OriginalsAutomaticPanel from './OriginalsAutomaticPanel'

import OriginalsConditionsPanel from './OriginalsConditionsPanel'
import { getGameMeta } from '../registry/gameMeta'
import OriginalsManualPanel from './OriginalsManualPanel'

import OriginalsModeHeader from './OriginalsModeHeader'

import OriginalsSettingsModal from './OriginalsSettingsModal'

import OriginalsStatsDrawer from './OriginalsStatsDrawer'
import OriginalsSidebar from './OriginalsSidebar'
import OriginalsBetBrowser from './OriginalsBetBrowser'
import OriginalsLastResultVisual, { betRowToVisual, type OriginalsLastBetVisual } from './OriginalsLastResultVisual'
import ActiveTargetSummary from './ActiveTargetSummary'

import {
  loadBettingMode,
  loadProfilesOnStart,
  loadWorkbenchSettings,
  saveBettingMode,
  saveStatsDrawerOpen,
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
  gameEntry: ReturnType<typeof getOriginalsGame>
): OriginalsBettingMode {
  if (mode === 'dice-runner' && slug !== 'dice') return 'automatic'
  if (mode === 'conditions' && slug !== 'dice') return 'automatic'
  if (mode === 'manual' && gameEntry && !gameEntry.supportsManual) return 'automatic'
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
  const [mode, setMode] = useState<OriginalsBettingMode>(() =>
    normalizeModeForGame(loadBettingMode(), gameSlug, getOriginalsGame(gameSlug))
  )
  const [statsOpen, setStatsOpen] = useState(() => {
    try {
      const v = localStorage.getItem('originalsWorkbenchStatsOpen')
      if (v === '0') return false
      if (v === '1') return true
    } catch {
      /* ignore */
    }
    return true
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
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
        const profiles = loadProfiles()
        const match = profiles.find(
          (p) => p.name === strategyId || p.name.toLowerCase() === strategyId.toLowerCase()
        )
        if (match?.options) return { ...base, ...match.options, game: gameSlug }
      }
    } catch {
      /* ignore */
    }
    if (loadProfilesOnStart()) {
      const profile = loadProfiles().find((p) => p.loadOnStart)
      if (profile?.options) return { ...base, ...profile.options, game: gameSlug }
    }
    return base
  })

  const resolvedAutoOptions = useMemo(
    () => ({ ...autoOptions, game: gameSlug }),
    [autoOptions, gameSlug]
  )

  const session = useOriginalsSession(accessToken, wbSettings)
  const gameMeta = getGameMeta(gameSlug)
  const [manualLastResult, setManualLastResult] = useState<OriginalsLastBetVisual | null>(null)

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
      setManualLastResult(null)
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
  const showManual = mode === 'manual' && game.supportsManual && game.uiReady
  const showConditions = mode === 'conditions' && game.slug === 'dice'
  const showSidebar = showAutomatic || showManual || showConditions
  const centerLastResult =
    mode === 'automatic' ? automaticLastResult : mode === 'manual' && game.supportsManual && game.uiReady ? manualLastResult : null

  const showBetHistory = (showAutomatic || showConditions) && wbSettings.showBetList
  const statsVisible = statsOpen && wbSettings.showStatsPanel
  const turboOk = isTurboCompatibleGame(gameSlug)

  return (
    <div
      className={`originals-workbench${statsVisible ? ' has-stats-open' : ''}${wbSettings.statsFloating ? ' has-stats-float' : ''}`}
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
        onOpenSettings={() => setSettingsOpen(true)}
        currency={wbSettings.currency}
        onCurrencyChange={handleCurrencyChange}
        currencyDisabled={session.running}
        accessToken={accessToken}
        turboMode={wbSettings.turboMode}
        turboCompatible={turboOk}
        onToggleTurbo={toggleTurbo}
      />

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
          {(showAutomatic || showManual) && (
            <div className="originals-center-stage">
              <OriginalsLastResultVisual
                result={centerLastResult}
                gameSlug={gameSlug}
                idleHint={
                  showManual
                    ? 'Place a manual bet to see the result here.'
                    : 'Start betting — the latest result appears here.'
                }
              />

              <ActiveTargetSummary
                gameSlug={gameSlug}
                options={resolvedAutoOptions}
                currency={wbSettings.currency}
              />

              <div className="originals-game-context casino-card">
                <p className="originals-game-hero-tagline">{gameMeta.tagline}</p>
                <div className="originals-game-hero-pills">
                  {game.supportsCombo && <span className="originals-pill originals-pill--combo">Combo</span>}
                  {game.supportsManual && <span className="originals-pill">Manual</span>}
                  {wbSettings.turboMode && turboOk && (
                    <span className="originals-pill originals-pill--turbo">Turbo</span>
                  )}
                  {game.supportsAsync && !wbSettings.turboMode && (
                    <span className="originals-pill">Fast</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {showDiceRunner && <DiceRunnerTab />}

          {showCode && (
            <div className="casino-card">
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

          {showBetHistory && (
            <OriginalsBetBrowser
              betList={session.betList}
              maxRows={wbSettings.betListMaxEntries}
              columns={getBetListColumns(wbSettings, gameSlug)}
            />
          )}

          {showManual && (
            <div className="casino-card">
              <OriginalsManualPanel
                gameSlug={gameSlug}
                options={resolvedAutoOptions}
                currency={wbSettings.currency}
                accessToken={accessToken}
                onResult={setManualLastResult}
              />
            </div>
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

          {mode === 'manual' && !showManual && (
            <div className="casino-card p-6 text-center text-sm text-[var(--text-muted)]">
              Manual bet not available for {game.name} yet.
            </div>
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
      </div>

      <OriginalsSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={wbSettings}
        onChange={applySettings}
      />
    </div>
  )
}
