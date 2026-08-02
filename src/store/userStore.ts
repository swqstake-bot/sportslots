import { create } from 'zustand';
import { useStakeSiteStore } from './stakeSiteStore';
import { EU_CURRENCY_CODES, pickDefaultCurrency } from '../components/Casino/constants/currencies';

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
  amountMajor?: number;
  amountMinor?: number;
  currency: string;
  payout: number;
  payoutMajor?: number;
  payoutMinor?: number;
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
  /** Stake Shield: angepasste Odds (die wir abgeschlossen haben) */
  adjustments?: { payoutMultiplier?: number };
  eventEnvelope?: any;
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
  /** Patch one currency from balanceUpdated WS without full API refresh. */
  patchBalance: (currency: string, amount: number) => void;
  setSelectedCurrency: (currency: string) => void;
  setActiveBets: (bets: SportBet[]) => void;
  addActiveBet: (bet: SportBet) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  balances: {},
  availableCurrencies: [],
  selectedCurrency: 'usdc',
  activeBets: [],

  setUser: (user) => set({ user }),
  
  setBalancesFromApi: (balancesData) => {
    const balancesMap: { [currency: string]: number } = {};
    const currencies: string[] = [];
    const site = useStakeSiteStore.getState().preferredSite;

    if (Array.isArray(balancesData)) {
      balancesData.forEach(b => {
        if (b.available && b.available.currency) {
          const curr = b.available.currency.toLowerCase();
          balancesMap[curr] = b.available.amount;

          // Hide empty USD noise on classic Stake
          if (curr === 'usd' && b.available.amount <= 0.01) {
             return;
          }

          // Only wallets the account actually has
          if (site === 'eu') {
            if (EU_CURRENCY_CODES.includes(curr)) currencies.push(curr);
          } else if (!EU_CURRENCY_CODES.includes(curr)) {
            currencies.push(curr);
          }
        }
      });
    }

    // EU: only keep gold/sweeps that the API actually returned
    if (site === 'eu') {
      for (const code of EU_CURRENCY_CODES) {
        if (balancesMap[code] === undefined) continue
        if (!currencies.includes(code)) currencies.push(code)
      }
    }

    const currentSelected = get().selectedCurrency;
    const optionList = currencies.map((value) => ({ value, label: value.toUpperCase() }));
    const newSelected = pickDefaultCurrency(optionList, currentSelected, site);

    set({
        balances: balancesMap,
        availableCurrencies: currencies,
        selectedCurrency: newSelected
    });
  },

  patchBalance: (currency, amount) => {
    const cur = String(currency || '').toLowerCase()
    if (!cur || !Number.isFinite(amount)) return
    set((state) => ({
      balances: { ...state.balances, [cur]: amount },
    }))
  },

  setSelectedCurrency: (currency) => set({ selectedCurrency: currency }),
  setActiveBets: (bets) => set({
    activeBets: Array.from(new Map((bets || []).filter((b) => b?.id).map((b) => [b.id, b])).values()),
  }),
  addActiveBet: (bet) => set((state) => ({
    activeBets: [bet, ...state.activeBets.filter((b) => b.id !== bet.id)],
  })),
  
  logout: () => set({
    user: null,
    balances: {},
    availableCurrencies: useStakeSiteStore.getState().preferredSite === 'eu' ? ['gold', 'sweeps'] : [],
    selectedCurrency: useStakeSiteStore.getState().preferredSite === 'eu' ? 'sweeps' : 'usdc',
    activeBets: [],
  })
}));
