import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  currentView: 'sports' | 'casino';
  casinoMode: 'play' | 'challenges' | 'bonushunt' | 'forum' | 'logs';
  selectedSport: string | null;
  rightSidebarTab: 'autobet' | 'activebets' | 'betslip';
  isBetSlipExpanded: boolean;
  isActiveBetsModalOpen: boolean;

  setCurrentView: (view: 'sports' | 'casino') => void;
  setCasinoMode: (mode: 'play' | 'challenges' | 'bonushunt' | 'forum' | 'logs') => void;
  setSelectedSport: (sport: string | null) => void;
  setRightSidebarTab: (tab: 'autobet' | 'activebets' | 'betslip') => void;
  toggleBetSlip: () => void;
  toggleActiveBetsModal: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      currentView: 'sports',
      casinoMode: 'play',
      selectedSport: 'soccer',
      rightSidebarTab: 'activebets',
      isBetSlipExpanded: true,
      isActiveBetsModalOpen: false,

      setCasinoMode: (mode) => set({ casinoMode: mode }),
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedSport: (sport) => set({ selectedSport: sport }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
      toggleBetSlip: () => set((state) => ({ isBetSlipExpanded: !state.isBetSlipExpanded })),
      toggleActiveBetsModal: () => set((state) => ({ isActiveBetsModalOpen: !state.isActiveBetsModalOpen })),
    }),
    {
      name: 'ui-storage',
    }
  )
);
