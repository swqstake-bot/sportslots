import OriginalsView from '../OriginalsView'
import AutoChallengeHunter from '../AutoChallengeHunter'
import TelegramChallengeHunter from '../TelegramChallengeHunter'
import BonusHuntControl from '../BonusHuntControl'
import ForumChallengeView from '../ForumChallengeView'
import BetList from '../BetList'
import LogViewer from '../LogViewer'
import { PlayModeContent } from './PlayModeContent'
import { SectionCard } from '../ui/SectionCard'
import type { CasinoSlotInstance, SlotSet } from '../../types'

interface CasinoModeContentProps {
  mode: string
  token: string
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
  handleSelectChallenge: (challenge: { gameSlug: string; gameName?: string; currency?: string; targetMultiplier?: number }) => void
}

export function CasinoModeContent(props: CasinoModeContentProps) {
  const {
    mode,
    token,
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
  } = props

  if (mode === 'originals') return <OriginalsView accessToken={token} />

  if (mode === 'play') {
    return (
      <PlayModeContent
        webSlots={webSlots}
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
      />
    )
  }

  if (mode === 'challenges') {
    return (
      <SectionCard title="Auto Hunter">
        <AutoChallengeHunter accessToken={token} webSlots={webSlots as any} onDiscoveredSlots={handleDiscoveredSlots} />
      </SectionCard>
    )
  }

  if (mode === 'telegram') {
    return (
      <SectionCard title="Telegram Hunter">
        <TelegramChallengeHunter accessToken={token} webSlots={webSlots as any} onDiscoveredSlots={handleDiscoveredSlots} />
      </SectionCard>
    )
  }

  if (mode === 'bonushunt') {
    return (
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

  if (mode === 'forum') {
    return <ForumChallengeView accessToken={token} webSlots={webSlots as any} onSelectChallenge={handleSelectChallenge} />
  }

  if (mode === 'logs') {
    return (
      <div className="space-y-6">
        <SectionCard title="Recent Bets">
          <BetList bets={recentBets} totalCount={recentBets?.length ?? 0} currencyCode="usd" emptyMessage="No bets found" />
        </SectionCard>
        <LogViewer refreshKey={playLogRefreshKey} />
      </div>
    )
  }

  return null
}
