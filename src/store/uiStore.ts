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
  toast: ToastState;

  setFixtureSearchQuery: (q: string) => void;
  setCurrentView: (view: 'sports' | 'casino' | 'logger') => void;
  setCasinoMode: (mode: 'play' | 'originals' | 'challenges' | 'telegram' | 'bonushunt' | 'forum' | 'logs') => void;
  setSelectedSportSlug: (sportSlug: string | null) => void;
  setSportFilterType: (type: 'live' | 'upcoming') => void;
  setRightSidebarTab: (tab: 'autobet' | 'activebets' | 'betslip') => void;
  toggleBetSlip: () => void;
  toggleActiveBetsModal: () => void;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
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
      toast: { message: null, type: 'info' },

      setFixtureSearchQuery: (q) => set({ fixtureSearchQuery: q }),
      setCasinoMode: (mode) => set({ casinoMode: mode }),
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedSportSlug: (sportSlug) => set({ selectedSportSlug: sportSlug }),
      setSportFilterType: (type) => set({ sportFilterType: type }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
      toggleBetSlip: () => set((state) => ({ isBetSlipExpanded: !state.isBetSlipExpanded })),
      toggleActiveBetsModal: () => set((state) => ({ isActiveBetsModalOpen: !state.isActiveBetsModalOpen })),
      showToast: (message, type = 'info') => set({ toast: { message, type } }),
      clearToast: () => set({ toast: { message: null, type: 'info' } }),
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
      }),
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        if (persistedState.selectedSportSlug) return persistedState
        const legacySport = persistedState.selectedSport ?? 'soccer'
        return {
          ...persistedState,
          selectedSportSlug: legacySport,
        }
      },
    }
  )
);
