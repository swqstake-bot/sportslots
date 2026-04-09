import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AutoBetStrategy =
  | 'Smart'
  | 'Conservative'
  | 'Aggressive'
  | 'Balanced'
  | 'Favorites'
  | 'Underdogs'
  | 'Diverse'
  | 'ValueHunter'
  | 'Momentum'
  | 'Martingale'
  | 'Fibonacci'
  | 'Kelly'
  | 'Value'
  /** Zufällige Auswahl unter Kandidaten, deren Quoten bereits zwischen Min und Max liegen */
  | 'RandomOdds';

export interface AutoBetLog {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  correlationId?: string;
  source?: string;
}

export interface AutoBetSettings {
  strategy: AutoBetStrategy;
  minOdds: number;
  maxOdds: number;
  minLegs: number;
  maxLegs: number;
  gameType: 'live' | 'upcoming' | 'all'; // New field for game type selection
  sportSlug: string; // New field for sport selection (slug or 'all')
  preferLiveGames: boolean; // Deprecated, kept for compatibility
  preferUpcomingGames: boolean; // Deprecated, kept for compatibility
  ignoreLiveGames: boolean;
  onlyEsport: boolean;
  amount: number; // Base stake amount
  currency: string; // Currency to use
  numberOfBets: number;
  eventFilter: string;
  /** Picker: sport slug from Sport list — then load tournaments */
  eventTournamentSport: string;
  /** Category slug (e.g. ufc) */
  eventTournamentCategory: string;
  /** Tournament slug (e.g. ufc-fight-night-...) */
  eventTournamentSlug: string;
  /** Optional fallback: paste full Stake URL; clears picker when set */
  eventTournamentUrl: string;
  /** With tournament scope: each bet uses as many legs as distinct fixtures (capped by Max Legs), not random Min–Max */
  fillUpEventMaxLegs: boolean;
  scanLimit?: number;
  enabled: boolean;
  
  // New Logic Settings
  fillUp: boolean; // If true, retry every 3 mins when 150 limit reached
  coverWithShield: boolean; // If true, place duplicate bet with shield after normal bet

  // Stake Shield Settings
  stakeShield: {
    enabled: boolean;
    legsThatCanLose: number;
    strictMode: boolean; // Skip bet if Shield unavailable
  };
}

export interface AutoBetState {   
  settings: AutoBetSettings;
  logs: AutoBetLog[];
  isRunning: boolean;
  isModalOpen: boolean;
  
  updateSettings: (settings: Partial<AutoBetSettings>) => void;
  start: () => void;
  stop: () => void;
  addLog: (message: string, type?: AutoBetLog['type']) => void;
  addRuntimeLog: (message: string, source: string, correlationId?: string, type?: AutoBetLog['type']) => void;
  clearLogs: () => void;
  openModal: () => void;
  closeModal: () => void;
}

const DEFAULT_SETTINGS: AutoBetSettings = {
  strategy: 'Smart',
  minOdds: 1.2,
  maxOdds: 5.0,
  minLegs: 2,
  maxLegs: 5,
  gameType: 'upcoming', // Default to upcoming
  sportSlug: 'all', // Default to all sports
  preferLiveGames: false,
  preferUpcomingGames: true,
  ignoreLiveGames: false,
  onlyEsport: false,
  amount: 0.00001, // Safe default
  currency: 'usd',
  numberOfBets: 10,
  eventFilter: '',
  eventTournamentSport: '',
  eventTournamentCategory: '',
  eventTournamentSlug: '',
  eventTournamentUrl: '',
  fillUpEventMaxLegs: false,
  enabled: false,
  fillUp: false,
  coverWithShield: false,
  stakeShield: {
    enabled: false,
    legsThatCanLose: 1,
    strictMode: false,
  },
};

export const useAutoBetStore = create<AutoBetState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      logs: [],
      isRunning: false,
      isModalOpen: false,

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings },
      })),

      start: () => set({ isRunning: true }),
      stop: () => set({ isRunning: false }),

      addLog: (message, type = 'info') =>
        set((state) => {
          const next = [
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              message,
              type,
            },
            ...state.logs,
          ].slice(0, 100);
          try {
            localStorage.setItem(
              'autobet_logs_backup',
              JSON.stringify({ savedAt: Date.now(), logs: next.slice(0, 50) })
            );
          } catch {
            /* ignore quota / private mode */
          }
          return { logs: next };
        }),

      addRuntimeLog: (message, source, correlationId, type = 'info') =>
        set((state) => {
          const next = [
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              message,
              type,
              source,
              correlationId,
            },
            ...state.logs,
          ].slice(0, 150);
          return { logs: next };
        }),

      clearLogs: () => set({ logs: [] }),

      openModal: () => set({ isModalOpen: true }),
      closeModal: () => set({ isModalOpen: false }),
    }),
    {
      name: 'autobet-storage',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
