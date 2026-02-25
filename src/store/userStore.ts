import { create } from 'zustand';

export interface Balance {
  amount: number;
  currency: string;
}

export interface UserBalance {
  available: Balance;
  vault: Balance;
}

export interface SportBetOutcome {
  id: string;
  odds: number;
  status: string;
  outcome: {
    id: string;
    odds: number;
    name: string;
  };
  market: {
    id: string;
    name: string;
    status: string;
  };
  fixture: {
    id: string;
    name: string;
    status: string;
    eventStatus?: {
      homeScore: number;
      awayScore: number;
      matchStatus: string;
      clock?: {
        matchTime: string;
        remainingTime: string;
      };
      periodScores?: any[];
      currentTeamServing?: string;
      homeGameScore?: string;
      awayGameScore?: string;
      statistic?: {
        yellowCards?: { away: number; home: number };
        redCards?: { away: number; home: number };
        corners?: { home: number; away: number };
      };
    };
    tournament?: {
      category: {
        sport: {
          cashoutConfiguration?: {
            cashoutEnabled: boolean;
          };
        };
      };
    };
  };
}

/** Custom price from API (e.g. stake_shield) */
export interface SportBetCustomPrice {
  type?: string;
}

export interface SportBet {
  id: string;
  active: boolean;
  status: string;
  customBet: boolean;
  cashoutDisabled: boolean;
  amount: number;
  currency: string;
  payout: number;
  potentialMultiplier: number;
  payoutMultiplier: number;
  cashoutMultiplier: number;
  createdAt: string;
  iid?: string;
  bet?: {
    iid: string;
  };
  user: {
    id: string;
  };
  outcomes: SportBetOutcome[];
  /** Estimated or API-provided cashout value (currency units) */
  cashoutValue?: number;
  /** API custom prices – e.g. stake_shield disables cashout */
  customPrices?: SportBetCustomPrice[];
}

interface User {
  id: string;
  name: string;
  // balances in API response is an array of UserBalance objects
  balances?: UserBalance[]; 
}

interface UserState {
  user: User | null;
  // We'll store a map of currency -> available amount for easy access
  balances: { [currency: string]: number }; 
  availableCurrencies: string[];
  selectedCurrency: string;
  activeBets: SportBet[]; // Store active bets here
  
  setUser: (user: User) => void;
  setBalancesFromApi: (balancesData: UserBalance[]) => void;
  setSelectedCurrency: (currency: string) => void;
  setActiveBets: (bets: SportBet[]) => void;
  addActiveBet: (bet: SportBet) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  balances: {},
  availableCurrencies: ['btc'], 
  selectedCurrency: 'btc',
  activeBets: [],

  setUser: (user) => set({ user }),
  
  setBalancesFromApi: (balancesData) => {
    const balancesMap: { [currency: string]: number } = {};
    const currencies: string[] = [];

    if (Array.isArray(balancesData)) {
      balancesData.forEach(b => {
        if (b.available && b.available.currency) {
          const curr = b.available.currency.toLowerCase();
          balancesMap[curr] = b.available.amount;
          
          // User request: Hide USD if empty (useless wallet)
          if (curr === 'usd' && b.available.amount <= 0.01) {
             return; 
          }
          
          // Show ALL other currencies (Crypto & Fiat) regardless of balance
          // This restores the behavior "ganz am anfang habe ich alle meine balances gesehen"
          currencies.push(curr);
        }
      });
    }

    // Always ensure BTC is available in the list, even if API didn't return it
    if (!currencies.includes('btc')) {
        currencies.push('btc');
        if (balancesMap['btc'] === undefined) {
            balancesMap['btc'] = 0;
        }
    }

    // Default to BTC
    let newSelected = 'btc';
    const currentSelected = get().selectedCurrency;
    
    // If current selection is valid and not 'usd' (unless we want 'usd'), keep it.
    // If user wants BTC standard, we default to BTC.
    // However, if the user explicitly selected something else (like XRP) and it's valid, keep it.
    if (currentSelected && currencies.includes(currentSelected) && currentSelected !== 'usd') {
        newSelected = currentSelected;
    }
    
    set({
        balances: balancesMap,
        availableCurrencies: currencies,
        selectedCurrency: newSelected
    });
  },

  setSelectedCurrency: (currency) => set({ selectedCurrency: currency }),
  setActiveBets: (bets) => set({ activeBets: bets }),
  addActiveBet: (bet) => set((state) => ({ activeBets: [bet, ...state.activeBets] })),
  
  logout: () => set({ user: null, balances: {}, availableCurrencies: ['btc'], selectedCurrency: 'btc', activeBets: [] })
}));
