import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  type: ToastType;
}

interface UiState {
  currentView: 'sports' | 'casino' | 'logger';
  casinoMode: 'play' | 'originals' | 'challenges' | 'telegram' | 'bonushunt' | 'forum' | 'logs';
  /** Ausgewählter Sport-Slug (z. B. soccer, tennis). */
  selectedSportSlug: string | null;
  /** Live/Upcoming-Filter bei Sportansicht (z.B. Soccer) */
  sportFilterType: 'live' | 'upcoming';
  /** Suchbegriff für Fixture-Namen (Sports) */
  fixtureSearchQuery: string;
  rightSidebarTab: 'autobet' | 'activebets' | 'betslip';
  isBetSlipExpanded: boolean;
  isActiveBetsModalOpen: boolean;
  activeBetsPreviewBetId: string | null;
  /** User accent override (null = use CSS defaults per `data-app-mode`). */
  accentCustomHex: string | null;
  /** Scales border/glow strength (0.4–1.2). */
  accentStrength: number;
  /** Accent brightness: 1 = neutral, lower = darker, higher = lighter (0.5–1.45). */
  accentBrightness: number;
  toast: ToastState;

  setFixtureSearchQuery: (q: string) => void;
  setCurrentView: (view: 'sports' | 'casino' | 'logger') => void;
  setCasinoMode: (mode: 'play' | 'originals' | 'challenges' | 'telegram' | 'bonushunt' | 'forum' | 'logs') => void;
  setSelectedSportSlug: (sportSlug: string | null) => void;
  setSportFilterType: (type: 'live' | 'upcoming') => void;
  setRightSidebarTab: (tab: 'autobet' | 'activebets' | 'betslip') => void;
  toggleBetSlip: () => void;
  toggleActiveBetsModal: () => void;
  openActiveBetsModal: (previewBetId?: string | null) => void;
  closeActiveBetsModal: () => void;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
  setAccentCustomHex: (hex: string | null) => void;
  setAccentStrength: (n: number) => void;
  setAccentBrightness: (n: number) => void;
  resetAccentTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      currentView: 'sports',
      casinoMode: 'play',
      selectedSportSlug: 'soccer',
      sportFilterType: 'upcoming',
      fixtureSearchQuery: '',
      rightSidebarTab: 'activebets',
      isBetSlipExpanded: true,
      isActiveBetsModalOpen: false,
      activeBetsPreviewBetId: null,
      accentCustomHex: null,
      accentStrength: 1,
      accentBrightness: 1,
      toast: { message: null, type: 'info' },

      setFixtureSearchQuery: (q) => set({ fixtureSearchQuery: q }),
      setCasinoMode: (mode) => set({ casinoMode: mode }),
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedSportSlug: (sportSlug) => set({ selectedSportSlug: sportSlug }),
      setSportFilterType: (type) => set({ sportFilterType: type }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
      toggleBetSlip: () => set((state) => ({ isBetSlipExpanded: !state.isBetSlipExpanded })),
      toggleActiveBetsModal: () => set((state) => ({ isActiveBetsModalOpen: !state.isActiveBetsModalOpen })),
      openActiveBetsModal: (previewBetId = null) => set({ isActiveBetsModalOpen: true, activeBetsPreviewBetId: previewBetId }),
      closeActiveBetsModal: () => set({ isActiveBetsModalOpen: false, activeBetsPreviewBetId: null }),
      showToast: (message, type = 'info') => set({ toast: { message, type } }),
      clearToast: () => set({ toast: { message: null, type: 'info' } }),
      setAccentCustomHex: (hex) => set({ accentCustomHex: hex }),
      setAccentStrength: (n) =>
        set({ accentStrength: Math.min(1.2, Math.max(0.4, Number.isFinite(n) ? n : 1)) }),
      setAccentBrightness: (n) =>
        set({ accentBrightness: Math.min(1.45, Math.max(0.5, Number.isFinite(n) ? n : 1)) }),
      resetAccentTheme: () => set({ accentCustomHex: null, accentStrength: 1, accentBrightness: 1 }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        currentView: state.currentView,
        casinoMode: state.casinoMode,
        selectedSportSlug: state.selectedSportSlug,
        sportFilterType: state.sportFilterType,
        rightSidebarTab: state.rightSidebarTab,
        isBetSlipExpanded: state.isBetSlipExpanded,
        accentCustomHex: state.accentCustomHex,
        accentStrength: state.accentStrength,
        accentBrightness: state.accentBrightness,
      }),
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        let next = persistedState
        if (typeof persistedState.accentBrightness !== 'number') {
          next = { ...next, accentBrightness: 1 }
        }
        if (persistedState.selectedSportSlug) return next
        const legacySport = persistedState.selectedSport ?? 'soccer'
        return {
          ...next,
          selectedSportSlug: legacySport,
        }
      },
    }
  )
);
