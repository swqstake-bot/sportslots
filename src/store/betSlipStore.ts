import { create } from 'zustand';

export interface Outcome {
  id: string;
  odds: number;
  name: string;
  marketName: string;
  fixtureName: string;
  fixtureId: string;
}

interface BetSlipState {
  outcomes: Outcome[];
  addOutcome: (outcome: Outcome) => void;
  removeOutcome: (outcomeId: string) => void;
  clearSlip: () => void;
}

export const useBetSlipStore = create<BetSlipState>((set) => ({
  outcomes: [],
  addOutcome: (outcome) => set((state) => {
    // Prevent adding same outcome twice
    if (state.outcomes.some(o => o.id === outcome.id)) return state;
    // For single bets, we might want to replace if different market/fixture? 
    // For now, let's just allow adding multiple (multi-bet support logic can come later)
    return { outcomes: [...state.outcomes, outcome] };
  }),
  removeOutcome: (id) => set((state) => ({
    outcomes: state.outcomes.filter(o => o.id !== id)
  })),
  clearSlip: () => set({ outcomes: [] }),
}));
