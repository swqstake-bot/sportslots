import { useEffect, useState, type ReactNode } from 'react'
import { removeWorkspaceSession } from '../../../../store/workspaceSessionStore'
import { reportHubWorkspaceStatus } from '../../../../utils/workspaceHubStatus'
import OriginalsView from '../OriginalsView'
import BonusHuntControl from '../BonusHuntControl'
import BetList from '../BetList'
import LogViewer from '../LogViewer'
import { PlayModeContent } from './PlayModeContent'
import { SectionCard } from '../ui/SectionCard'
import { ChallengeHubView } from '../ChallengeHubView'
import { PromotionsHubView } from '../challengeHub/PromotionsHubView'
import { useCasinoStore } from '../../store/casinoStore'
import type { CasinoChallengeSelection } from '../../types'

const HUB_MODES = new Set(['challengeHub', 'challenges'])

interface CasinoModeContentProps {
  mode: string
  token: string
  slotsLoading: boolean
  webSlots: any[]
  selectedSlugs: string[]
  displayedCurrencies: { value: string; label: string }[]
  playLogRefreshKey: number
  recentBets: any[]
  setSaveSlotSetOpen: (v: boolean) => void
  clearSlotHistoryForInstances: () => void
  handleToggleSlot: (slug: string) => void
  handleAddInstance: (slug: string, source?: string | null, target?: string | null, blocked?: boolean) => void
  handleRemoveInstance: (instanceId: string) => void
  handleToggleFavorite: (slug: string) => void
  handleLoadSet: (id: string) => void
  handleDeleteSet: (id: string, e: any) => void
  handleImportSets: (e: any) => void
  handleExportSets: () => void
  handleStartAll: () => void
  handleStopAll: () => void
  onStopInstance?: (instanceId: string) => void
  handleApplyFirstSlotSettings: () => void
  getSlotControlRef: (instanceId: string) => any
  handlePlayLogUpdate: () => void
  handleDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  handleSelectChallenge: (challenge: CasinoChallengeSelection) => void
  onDismissChallengeHandoff?: () => void
}

export function CasinoModeContent(props: CasinoModeContentProps) {
  const {
    mode,
    token,
    slotsLoading,
    webSlots,
    selectedSlugs,
    displayedCurrencies,
    playLogRefreshKey,
    recentBets,
    setSaveSlotSetOpen,
    clearSlotHistoryForInstances,
    handleToggleSlot,
    handleAddInstance,
    handleRemoveInstance,
    handleToggleFavorite,
    handleLoadSet,
    handleDeleteSet,
    handleImportSets,
    handleExportSets,
    handleStartAll,
    handleStopAll,
    onStopInstance,
    handleApplyFirstSlotSettings,
    getSlotControlRef,
    handlePlayLogUpdate,
    handleDiscoveredSlots,
    handleSelectChallenge,
    onDismissChallengeHandoff,
  } = props

  // Read state directly from casino store
  const {
    selectedSlotInstances,
    setSelectedSlotInstances,
    loadedSetId,
    slotSets,
    favorites,
    globalControlsOpen,
    setGlobalControlsOpen,
    sharedSourceCurrency,
    setSharedSourceCurrency,
    sharedTargetCurrency,
    setSharedTargetCurrency,
    sharedCryptoOnly,
    setSharedCryptoOnly,
    useSharedCurrency,
    setUseSharedCurrency,
    challengeHandoff,
  } = useCasinoStore()

  const isHubMode = HUB_MODES.has(mode)
  const isPromotionsMode = mode === 'promotions'
  // Keep hub mounted after first visit so queue/activeRuns survive Slots ↔ Hub switches.
  const [hubKeepAlive, setHubKeepAlive] = useState(false)
  const [promoKeepAlive, setPromoKeepAlive] = useState(false)
  if ((isHubMode || isPromotionsMode) && !hubKeepAlive) setHubKeepAlive(true)
  if (isPromotionsMode && !promoKeepAlive) setPromoKeepAlive(true)
  const showHub = hubKeepAlive
  const showPromotions = promoKeepAlive

  // Preserve the existing component instance after first use, including its
  // running session. Opening a different workspace is a view change only.
  const [openedModes, setOpenedModes] = useState(() => new Set([mode]))
  if (!openedModes.has(mode)) setOpenedModes(new Set([...openedModes, mode]))
  useEffect(() => () => {
    for (const source of ['hunter', 'balance', 'telegram']) removeWorkspaceSession(`casino-${source}`)
  }, [])

  let playContent: ReactNode = null
  if (openedModes.has('play')) {
    playContent = (
      <PlayModeContent
        webSlots={webSlots}
        slotsLoading={slotsLoading}
        selectedSlugs={selectedSlugs}
        selectedSlotInstances={selectedSlotInstances}
        loadedSetId={loadedSetId}
        slotSets={slotSets}
        favorites={favorites}
        globalControlsOpen={globalControlsOpen}
        sharedSourceCurrency={sharedSourceCurrency}
        sharedTargetCurrency={sharedTargetCurrency}
        sharedCryptoOnly={sharedCryptoOnly}
        useSharedCurrency={useSharedCurrency}
        displayedCurrencies={displayedCurrencies}
        token={token}
        setGlobalControlsOpen={setGlobalControlsOpen}
        setSharedSourceCurrency={setSharedSourceCurrency}
        setSharedTargetCurrency={setSharedTargetCurrency}
        setSharedCryptoOnly={setSharedCryptoOnly}
        setUseSharedCurrency={setUseSharedCurrency}
        setSaveSlotSetOpen={setSaveSlotSetOpen}
        handleToggleSlot={handleToggleSlot}
        handleAddInstance={handleAddInstance}
        handleRemoveInstance={handleRemoveInstance}
        handleToggleFavorite={handleToggleFavorite}
        handleLoadSet={handleLoadSet}
        handleDeleteSet={handleDeleteSet}
        handleImportSets={handleImportSets}
        handleExportSets={handleExportSets}
        handleStartAll={handleStartAll}
        handleStopAll={handleStopAll}
        onStopInstance={onStopInstance}
        handleApplyFirstSlotSettings={handleApplyFirstSlotSettings}
        getSlotControlRef={getSlotControlRef}
        handlePlayLogUpdate={handlePlayLogUpdate}
        challengeHandoff={challengeHandoff}
        onDismissChallengeHandoff={onDismissChallengeHandoff}
      />
    )
  }
  let bonusContent: ReactNode = null
  if (openedModes.has('bonushunt')) {
    bonusContent = (
      <div className="bonushunt-wrapper">
        <BonusHuntControl
          accessToken={token}
          slots={webSlots as any}
          selectedSlugs={selectedSlugs as any}
          onToggleSlot={handleToggleSlot}
          onSelectAll={() =>
            setSelectedSlotInstances(
              webSlots.map((s: any) => ({
                id: `inst_${Date.now()}_${s.slug}_${Math.random().toString(36).slice(2, 9)}`,
                slug: s.slug,
                sourceCurrency: sharedSourceCurrency,
                targetCurrency: sharedTargetCurrency,
              }))
            )
          }
          onSelectNone={clearSlotHistoryForInstances}
          slotSets={slotSets as any}
          loadedSetId={loadedSetId}
          onLoadSlotSet={handleLoadSet}
          onSaveSlotSet={() => setSaveSlotSetOpen(true)}
          onDeleteSlotSet={handleDeleteSet}
          onToggleFavorite={handleToggleFavorite}
          favorites={favorites as any}
        />
      </div>
    )
  }
  const diagnostics = mode === 'logs' ? (
      <div className="space-y-6">
        <SectionCard title="API Debug">
          <BetList bets={recentBets} totalCount={recentBets?.length ?? 0} currencyCode="usd" emptyMessage="No bets found" />
        </SectionCard>
        <LogViewer refreshKey={playLogRefreshKey} />
      </div>
    ) : null

  return (
    <>
      <div data-casino-panel="play" className="casino-mode-panel" hidden={mode !== 'play'}>{playContent}</div>
      <div data-casino-panel="originals" className="casino-mode-panel" hidden={mode !== 'originals'}>{openedModes.has('originals') && <OriginalsView accessToken={token} />}</div>
      <div data-casino-panel="bonushunt" className="casino-mode-panel" hidden={mode !== 'bonushunt'}>{bonusContent}</div>
      {showHub ? (
        <div className={isHubMode ? 'min-w-0 min-h-0' : 'hidden'} aria-hidden={!isHubMode}>
          <ChallengeHubView
            accessToken={token}
            webSlots={webSlots as any}
            onDiscoveredSlots={handleDiscoveredSlots}
            onSelectChallenge={handleSelectChallenge}
            onHubStatsChange={reportHubWorkspaceStatus}
          />
        </div>
      ) : null}
      {showPromotions ? (
        <div className={isPromotionsMode ? 'min-w-0 min-h-0' : 'hidden'} aria-hidden={!isPromotionsMode}>
          <PromotionsHubView
            accessToken={token}
            webSlots={webSlots as any}
            onDiscoveredSlots={handleDiscoveredSlots}
            onSelectChallenge={handleSelectChallenge}
            onHubStatsChange={reportHubWorkspaceStatus}
          />
        </div>
      ) : null}
      {diagnostics}
    </>
  )
}
