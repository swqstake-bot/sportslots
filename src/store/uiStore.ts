import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  type: ToastType;
}

interface UiState {
  currentView: 'sports' | 'casino';
  casinoMode: 'play' | 'challenges' | 'bonushunt' | 'forum' | 'logs';
  selectedSport: string | null;
  rightSidebarTab: 'autobet' | 'activebets' | 'betslip';
  isBetSlipExpanded: boolean;
  isActiveBetsModalOpen: boolean;
  toast: ToastState;

  setCurrentView: (view: 'sports' | 'casino') => void;
  setCasinoMode: (mode: 'play' | 'challenges' | 'bonushunt' | 'forum' | 'logs') => void;
  setSelectedSport: (sport: string | null) => void;
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
      selectedSport: 'soccer',
      rightSidebarTab: 'activebets',
      isBetSlipExpanded: true,
      isActiveBetsModalOpen: false,
      toast: { message: null, type: 'info' },

      setCasinoMode: (mode) => set({ casinoMode: mode }),
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedSport: (sport) => set({ selectedSport: sport }),
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
        selectedSport: state.selectedSport,
        rightSidebarTab: state.rightSidebarTab,
        isBetSlipExpanded: state.isBetSlipExpanded,
      }),
    }
  )
);
