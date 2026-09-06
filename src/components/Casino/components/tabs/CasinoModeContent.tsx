import { useState, type ReactNode } from 'react'
import OriginalsView from '../OriginalsView'
import BonusHuntControl from '../BonusHuntControl'
import BetList from '../BetList'
import LogViewer from '../LogViewer'
import { PlayModeContent } from './PlayModeContent'
import { SectionCard } from '../ui/SectionCard'
import { ChallengeHubView } from '../ChallengeHubView'
import { PromotionsHubView } from '../challengeHub/PromotionsHubView'
import type { CasinoSlotInstance, SlotSet, CasinoChallengeSelection } from '../../types'

const HUB_MODES = new Set(['challengeHub', 'challenges'])

interface CasinoModeContentProps {
  mode: string
  token: string
  slotsLoading: boolean
  webSlots: any[]
  selectedSlugs: string[]
  selectedSlotInstances: CasinoSlotInstance[]
  loadedSetId: string
  slotSets: SlotSet[]
  favorites: string[]
  globalControlsOpen: boolean
  sharedSourceCurrency: string
  sharedTargetCurrency: string
  sharedCryptoOnly: boolean
  useSharedCurrency: boolean
  displayedCurrencies: { value: string; label: string }[]
  playLogRefreshKey: number
  recentBets: any[]
  setGlobalControlsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setSharedSourceCurrency: (v: string) => void
  setSharedTargetCurrency: (v: string) => void
  setSharedCryptoOnly: (v: boolean) => void
  setUseSharedCurrency: (v: boolean) => void
  setSaveSlotSetOpen: (v: boolean) => void
  setSelectedSlotInstances: (updater: any) => void
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
  handleApplyFirstSlotSettings: () => void
  getSlotControlRef: (instanceId: string) => any
  handlePlayLogUpdate: () => void
  handleDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  handleSelectChallenge: (challenge: CasinoChallengeSelection) => void
  challengeHandoff?: { instanceId: string; gameName: string; targetMultiplier?: number } | null
  onDismissChallengeHandoff?: () => void
}

export function CasinoModeContent(props: CasinoModeContentProps) {
  const {
    mode,
    token,
    slotsLoading,
    webSlots,
    selectedSlugs,
    selectedSlotInstances,
    loadedSetId,
    slotSets,
    favorites,
    globalControlsOpen,
    sharedSourceCurrency,
    sharedTargetCurrency,
    sharedCryptoOnly,
    useSharedCurrency,
    displayedCurrencies,
    playLogRefreshKey,
    recentBets,
    setGlobalControlsOpen,
    setSharedSourceCurrency,
    setSharedTargetCurrency,
    setSharedCryptoOnly,
    setUseSharedCurrency,
    setSaveSlotSetOpen,
    setSelectedSlotInstances,
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
    handleApplyFirstSlotSettings,
    getSlotControlRef,
    handlePlayLogUpdate,
    handleDiscoveredSlots,
    handleSelectChallenge,
    challengeHandoff,
    onDismissChallengeHandoff,
  } = props

  const isHubMode = HUB_MODES.has(mode)
  const isPromotionsMode = mode === 'promotions'
  // Keep hub mounted after first visit so queue/activeRuns survive Slots ↔ Hub switches.
  const [hubKeepAlive, setHubKeepAlive] = useState(false)
  const [promoKeepAlive, setPromoKeepAlive] = useState(false)
  if ((isHubMode || isPromotionsMode) && !hubKeepAlive) setHubKeepAlive(true)
  if (isPromotionsMode && !promoKeepAlive) setPromoKeepAlive(true)
  const showHub = hubKeepAlive
  const showPromotions = promoKeepAlive

  let primary: ReactNode = null
  if (mode === 'originals') {
    primary = <OriginalsView accessToken={token} />
  } else if (mode === 'play') {
    primary = (
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
        handleApplyFirstSlotSettings={handleApplyFirstSlotSettings}
        getSlotControlRef={getSlotControlRef}
        handlePlayLogUpdate={handlePlayLogUpdate}
        challengeHandoff={challengeHandoff}
        onDismissChallengeHandoff={onDismissChallengeHandoff}
      />
    )
  } else if (mode === 'bonushunt') {
    primary = (
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
  } else if (mode === 'logs') {
    primary = (
      <div className="space-y-6">
        <SectionCard title="API Debug">
          <BetList bets={recentBets} totalCount={recentBets?.length ?? 0} currencyCode="usd" emptyMessage="No bets found" />
        </SectionCard>
        <LogViewer refreshKey={playLogRefreshKey} />
      </div>
    )
  }

  return (
    <>
      {showHub ? (
        <div className={isHubMode ? 'min-w-0 min-h-0' : 'hidden'} aria-hidden={!isHubMode}>
          <ChallengeHubView
            accessToken={token}
            webSlots={webSlots as any}
            onDiscoveredSlots={handleDiscoveredSlots}
            onSelectChallenge={handleSelectChallenge}
            onHubStatsChange={() => {}}
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
            onHubStatsChange={() => {}}
          />
        </div>
      ) : null}
      {!isHubMode && !isPromotionsMode ? primary : null}
    </>
  )
}
