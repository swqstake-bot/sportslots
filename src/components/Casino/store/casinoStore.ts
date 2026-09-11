import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CasinoSlotInstance, SlotSet } from '../types';
import { loadSlotSets, saveSlotSet, deleteSlotSet } from '../utils/slotSets';
import { loadFavorites, toggleFavorite } from '../utils/slotSets';

interface CasinoState {
  // Slot instances and sets
  selectedSlotInstances: CasinoSlotInstance[];
  slotSets: SlotSet[];
  loadedSetId: string;
  favorites: string[];

  // Shared currency preferences
  useSharedCurrency: boolean;
  sharedSourceCurrency: string;
  sharedTargetCurrency: string;
  sharedCryptoOnly: boolean;

  // UI state
  globalControlsOpen: boolean;
  
  // Challenge handoff
  challengeHandoff: {
    instanceId: string;
    gameName: string;
    targetMultiplier?: number;
  } | null;

  // Pending promo auto-starts
  pendingPromoAutoStarts: Array<{
    instanceId: string;
    autospinCount: number;
    targetMultiplier?: number;
    attempts: number;
    startRun?: boolean;
  }>;

  // Actions
  setSelectedSlotInstances: (updater: CasinoSlotInstance[] | ((prev: CasinoSlotInstance[]) => CasinoSlotInstance[])) => void;
  addSlotInstance: (instance: CasinoSlotInstance) => void;
  removeSlotInstance: (instanceId: string) => void;
  
  setSlotSets: (sets: SlotSet[]) => void;
  setLoadedSetId: (id: string) => void;
  saveCurrentSlotSet: (name: string) => void;
  deleteSlotSetById: (id: string) => void;
  
  setFavorites: (favorites: string[]) => void;
  toggleSlotFavorite: (slug: string) => void;
  
  setUseSharedCurrency: (value: boolean) => void;
  setSharedSourceCurrency: (currency: string) => void;
  setSharedTargetCurrency: (currency: string) => void;
  setSharedCryptoOnly: (value: boolean) => void;
  
  setGlobalControlsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  setChallengeHandoff: (handoff: { instanceId: string; gameName: string; targetMultiplier?: number } | null) => void;
  setPendingPromoAutoStarts: (starts: Array<{ instanceId: string; autospinCount: number; targetMultiplier?: number; attempts: number; startRun?: boolean }> | ((prev: Array<{ instanceId: string; autospinCount: number; targetMultiplier?: number; attempts: number; startRun?: boolean }>) => Array<{ instanceId: string; autospinCount: number; targetMultiplier?: number; attempts: number; startRun?: boolean }>)) => void;
  addPendingPromoAutoStart: (start: { instanceId: string; autospinCount: number; targetMultiplier?: number; attempts: number; startRun?: boolean }) => void;
  removePendingPromoAutoStart: (instanceId: string) => void;
}

export const useCasinoStore = create<CasinoState>()(
  persist(
    (set, get) => ({
      selectedSlotInstances: [],
      slotSets: loadSlotSets(),
      loadedSetId: '',
      favorites: loadFavorites(),
      
      useSharedCurrency: false,
      sharedSourceCurrency: 'usdc',
      sharedTargetCurrency: 'eur',
      sharedCryptoOnly: false,
      
      globalControlsOpen: false,
      challengeHandoff: null,
      pendingPromoAutoStarts: [],

      setSelectedSlotInstances: (updater) => {
        set((state) => ({
          selectedSlotInstances: typeof updater === 'function' ? updater(state.selectedSlotInstances) : updater,
        }));
      },

      addSlotInstance: (instance) => {
        set((state) => ({
          selectedSlotInstances: [...state.selectedSlotInstances, instance],
        }));
      },

      removeSlotInstance: (instanceId) => {
        set((state) => ({
          selectedSlotInstances: state.selectedSlotInstances.filter((i) => i.id !== instanceId),
        }));
      },

      setSlotSets: (sets) => set({ slotSets: sets }),
      
      setLoadedSetId: (id) => set({ loadedSetId: id }),

      saveCurrentSlotSet: (name) => {
        const { selectedSlotInstances } = get();
        const selectedSlugs = selectedSlotInstances.map((i) => i.slug);
        saveSlotSet({ name, slots: selectedSlugs });
        set({ slotSets: loadSlotSets() });
      },

      deleteSlotSetById: (id) => {
        deleteSlotSet(id);
        set({ slotSets: loadSlotSets(), loadedSetId: '' });
      },

      setFavorites: (favorites) => set({ favorites }),

      toggleSlotFavorite: (slug) => {
        toggleFavorite(slug);
        set({ favorites: loadFavorites() });
      },

      setUseSharedCurrency: (value) => set({ useSharedCurrency: value }),
      setSharedSourceCurrency: (currency) => set({ sharedSourceCurrency: currency }),
      setSharedTargetCurrency: (currency) => set({ sharedTargetCurrency: currency }),
      setSharedCryptoOnly: (value) => set({ sharedCryptoOnly: value }),

      setGlobalControlsOpen: (open) => {
        set((state) => ({
          globalControlsOpen: typeof open === 'function' ? open(state.globalControlsOpen) : open,
        }));
      },

      setChallengeHandoff: (handoff) => set({ challengeHandoff: handoff }),

      setPendingPromoAutoStarts: (starts) => {
        set((state) => ({
          pendingPromoAutoStarts: typeof starts === 'function' ? starts(state.pendingPromoAutoStarts) : starts,
        }));
      },

      addPendingPromoAutoStart: (start) => {
        set((state) => ({
          pendingPromoAutoStarts: [...state.pendingPromoAutoStarts, start],
        }));
      },

      removePendingPromoAutoStart: (instanceId) => {
        set((state) => ({
          pendingPromoAutoStarts: state.pendingPromoAutoStarts.filter((s) => s.instanceId !== instanceId),
        }));
      },
    }),
    {
      name: 'casino-storage',
      partialize: (state) => ({
        useSharedCurrency: state.useSharedCurrency,
        sharedSourceCurrency: state.sharedSourceCurrency,
        sharedTargetCurrency: state.sharedTargetCurrency,
        sharedCryptoOnly: state.sharedCryptoOnly,
        favorites: state.favorites,
      }),
    }
  )
);
