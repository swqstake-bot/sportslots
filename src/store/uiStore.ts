import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACCENT_BRIGHTNESS } from '../utils/accentTheme';

export type ToastType = 'success' | 'error' | 'info';

function normalizeCurrentView(v: unknown): 'sports' | 'casino' | 'logger' {
  return v === 'casino' || v === 'sports' || v === 'logger' ? v : 'casino';
}

const DEV_VISIBILITY_DEFAULTS = {
  /** Primary dev tools / devbox panel */
  devboxEnabled: false,
  /** Performance / timing overlay (when implemented) */
  perfOverlayVisible: false,
  /** Layout / alignment debug overlays (when implemented) */
  layoutDebugVisible: false,
} as const;

/** Persisted toggles for developer/debug UI surfaces (safe defaults: all off). Add keys alongside `DEV_VISIBILITY_DEFAULTS`. */
export type UiDevVisibility = {
  [K in keyof typeof DEV_VISIBILITY_DEFAULTS]: boolean;
};

function defaultDevVisibility(): UiDevVisibility {
  return { ...DEV_VISIBILITY_DEFAULTS };
}

function normalizeDevVisibility(raw: unknown): UiDevVisibility {
  const base = defaultDevVisibility();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const out = { ...base };
  for (const key of Object.keys(DEV_VISIBILITY_DEFAULTS) as (keyof UiDevVisibility)[]) {
    if (typeof o[key] === 'boolean') out[key] = o[key];
  }
  return out;
}

interface ToastState {
  message: string | null;
  type: ToastType;
}

export type CasinoMode = 'play' | 'originals' | 'challengeHub' | 'promotions' | 'bonushunt' | 'logs'

interface UiState {
  currentView: 'sports' | 'casino' | 'logger';
  casinoMode: CasinoMode;
  /** Ausgewählter Sport-Slug (z. B. soccer, tennis). */
  selectedSportSlug: string | null;
  /** Live/Upcoming-Filter bei Sportansicht (z.B. Soccer) */
  sportFilterType: 'live' | 'upcoming';
  /** Suchbegriff für Fixture-Namen (Sports) */
  fixtureSearchQuery: string;
  rightSidebarTab: 'autobet' | 'activebets';
  sportsCenterTab: 'settings' | 'logs' | 'bets';
  isActiveBetsModalOpen: boolean;
  activeBetsPreviewBetId: string | null;
  /** User accent override (null = use CSS defaults per `data-app-mode`). */
  accentCustomHex: string | null;
  /** Scales border/glow strength (0.4–1.2). */
  accentStrength: number;
  /** Accent RGB gain: 1 = as picked, below 1 dimmer, above 1 brighter (linear; see ACCENT_BRIGHTNESS). */
  accentBrightness: number;
  /** Developer/debug tool visibility (persisted; off by default). */
  devVisibility: UiDevVisibility;
  toast: ToastState;

  setFixtureSearchQuery: (q: string) => void;
  setCurrentView: (view: 'sports' | 'casino' | 'logger') => void;
  setCasinoMode: (mode: CasinoMode) => void;
  setSelectedSportSlug: (sportSlug: string | null) => void;
  setSportFilterType: (type: 'live' | 'upcoming') => void;
  setRightSidebarTab: (tab: 'autobet' | 'activebets') => void;
  setSportsCenterTab: (tab: 'settings' | 'logs' | 'bets') => void;
  toggleActiveBetsModal: () => void;
  openActiveBetsModal: (previewBetId?: string | null) => void;
  closeActiveBetsModal: () => void;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
  setAccentCustomHex: (hex: string | null) => void;
  setAccentStrength: (n: number) => void;
  setAccentBrightness: (n: number) => void;
  resetAccentTheme: () => void;
  setDevVisibility: (partial: Partial<UiDevVisibility>) => void;
  setDevVisibilityFlag: (key: keyof UiDevVisibility, enabled: boolean) => void;
  toggleDevVisibilityFlag: (key: keyof UiDevVisibility) => void;
  setDevboxEnabled: (enabled: boolean) => void;
  toggleDevboxEnabled: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      currentView: 'casino',
      casinoMode: 'play',
      selectedSportSlug: 'soccer',
      sportFilterType: 'upcoming',
      fixtureSearchQuery: '',
      rightSidebarTab: 'autobet',
      sportsCenterTab: 'settings',
      isActiveBetsModalOpen: false,
      activeBetsPreviewBetId: null,
      accentCustomHex: null,
      accentStrength: 1,
      accentBrightness: 1,
      devVisibility: defaultDevVisibility(),
      toast: { message: null, type: 'info' },

      setFixtureSearchQuery: (q) => set({ fixtureSearchQuery: q }),
      setCasinoMode: (mode) => set({ casinoMode: mode }),
      setCurrentView: (view) => set({ currentView: normalizeCurrentView(view) }),
      setSelectedSportSlug: (sportSlug) => set({ selectedSportSlug: sportSlug }),
      setSportFilterType: (type) => set({ sportFilterType: type }),
      setRightSidebarTab: (tab) => set({ rightSidebarTab: tab }),
      setSportsCenterTab: (tab) => set({ sportsCenterTab: tab }),
      toggleActiveBetsModal: () =>
        set((state) =>
          state.sportsCenterTab === 'bets'
            ? { sportsCenterTab: 'settings', activeBetsPreviewBetId: null, isActiveBetsModalOpen: false }
            : {
                currentView: 'sports',
                sportsCenterTab: 'bets',
                activeBetsPreviewBetId: null,
                isActiveBetsModalOpen: false,
              }
        ),
      openActiveBetsModal: (previewBetId = null) =>
        set({
          currentView: 'sports',
          sportsCenterTab: 'bets',
          activeBetsPreviewBetId: previewBetId,
          isActiveBetsModalOpen: false,
        }),
      closeActiveBetsModal: () => set({ activeBetsPreviewBetId: null, isActiveBetsModalOpen: false }),
      showToast: (message, type = 'info') => set({ toast: { message, type } }),
      clearToast: () => set({ toast: { message: null, type: 'info' } }),
      setAccentCustomHex: (hex) => set({ accentCustomHex: hex }),
      setAccentStrength: (n) =>
        set({ accentStrength: Math.min(1.2, Math.max(0.4, Number.isFinite(n) ? n : 1)) }),
      setAccentBrightness: (n) =>
        set({
          accentBrightness: Math.min(
            ACCENT_BRIGHTNESS.max,
            Math.max(ACCENT_BRIGHTNESS.min, Number.isFinite(n) ? n : 1)
          ),
        }),
      resetAccentTheme: () => set({ accentCustomHex: null, accentStrength: 1, accentBrightness: 1 }),
      setDevVisibility: (partial) =>
        set((state) => ({
          devVisibility: { ...state.devVisibility, ...partial },
        })),
      setDevVisibilityFlag: (key, enabled) =>
        set((state) => ({
          devVisibility: { ...state.devVisibility, [key]: enabled },
        })),
      toggleDevVisibilityFlag: (key) =>
        set((state) => ({
          devVisibility: {
            ...state.devVisibility,
            [key]: !state.devVisibility[key],
          },
        })),
      setDevboxEnabled: (enabled) =>
        set((state) => ({
          devVisibility: { ...state.devVisibility, devboxEnabled: enabled },
        })),
      toggleDevboxEnabled: () =>
        set((state) => ({
          devVisibility: {
            ...state.devVisibility,
            devboxEnabled: !state.devVisibility.devboxEnabled,
          },
        })),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        currentView: state.currentView,
        casinoMode: state.casinoMode,
        selectedSportSlug: state.selectedSportSlug,
        sportFilterType: state.sportFilterType,
        rightSidebarTab: state.rightSidebarTab,
        accentCustomHex: state.accentCustomHex,
        accentStrength: state.accentStrength,
        accentBrightness: state.accentBrightness,
        devVisibility: state.devVisibility,
      }),
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        let next = persistedState
        next = { ...next, currentView: normalizeCurrentView(persistedState.currentView) }
        next = {
          ...next,
          devVisibility: normalizeDevVisibility(persistedState.devVisibility),
        }
        if (typeof persistedState.accentBrightness !== 'number') {
          next = { ...next, accentBrightness: 1 }
        } else if (persistedState.accentBrightness > ACCENT_BRIGHTNESS.max) {
          next = { ...next, accentBrightness: ACCENT_BRIGHTNESS.max }
        }
        if (persistedState.rightSidebarTab === 'betslip') {
          next = { ...next, rightSidebarTab: 'activebets' }
        }
        if (
          persistedState.casinoMode === 'challenges' ||
          persistedState.casinoMode === 'telegram' ||
          persistedState.casinoMode === 'forum'
        ) {
          next = { ...next, casinoMode: 'challengeHub' }
        }
        if (persistedState.casinoMode === 'dev') {
          next = { ...next, casinoMode: 'play' }
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
