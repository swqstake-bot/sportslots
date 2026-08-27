import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CopyBetFeed = 'all' | 'highroller' | 'both'
export type CopyStakeMode = 'fixed' | 'percent' | 'cap'

export interface CopyBetLog {
  id: string
  timestamp: number
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export interface CopyBetSettings {
  feed: CopyBetFeed
  pollMs: number
  minOdds: number
  maxOdds: number
  minStakeUsd: number
  maxStakeUsd: number
  minLegs: number
  maxLegs: number
  sportSlug: string
  eventFilter: string
  userInclude: string
  userExclude: string
  skipHiddenUsers: boolean
  skipCustomBet: boolean
  skipOwnBets: boolean
  ignoreExistingOnStart: boolean
  scanOnly: boolean
  /** Session stop: total copied stake USD. 0 = off. */
  maxInvestUsd: number
  stakeMode: CopyStakeMode
  copyStakeUsd: number
  copyPercent: number
  copyMaxUsd: number
  currency: string
  oddsChange: 'any' | 'none'
}

export interface CopyFeedRow {
  id: string
  iid: string
  user: string
  hidden: boolean
  odds: number
  stakeUsd: number
  currency: string
  amount: number
  legs: number
  sport: string
  event: string
  matched: boolean
  skipReason?: string
  copied?: boolean
}

interface CopyBetState {
  settings: CopyBetSettings
  logs: CopyBetLog[]
  isRunning: boolean
  lastFeed: CopyFeedRow[]
  copiedCount: number
  scannedCount: number
  investedUsd: number
  updateSettings: (partial: Partial<CopyBetSettings>) => void
  start: () => void
  stop: () => void
  addLog: (message: string, type?: CopyBetLog['type']) => void
  clearLogs: () => void
  setLastFeed: (rows: CopyFeedRow[]) => void
  bumpCopied: (investUsd?: number) => void
  bumpScanned: (n: number) => void
  resetCounters: () => void
}

const DEFAULT_SETTINGS: CopyBetSettings = {
  feed: 'highroller',
  pollMs: 2500,
  minOdds: 1.2,
  maxOdds: 8,
  minStakeUsd: 20,
  maxStakeUsd: 5000,
  minLegs: 1,
  maxLegs: 6,
  sportSlug: 'all',
  eventFilter: '',
  userInclude: '',
  userExclude: '',
  skipHiddenUsers: true,
  skipCustomBet: true,
  skipOwnBets: true,
  ignoreExistingOnStart: true,
  scanOnly: false,
  maxInvestUsd: 0,
  stakeMode: 'fixed',
  copyStakeUsd: 1,
  copyPercent: 10,
  copyMaxUsd: 25,
  currency: 'usdt',
  oddsChange: 'any',
}

export const useCopyBetStore = create<CopyBetState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      logs: [],
      isRunning: false,
      lastFeed: [],
      copiedCount: 0,
      scannedCount: 0,
      investedUsd: 0,
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      start: () => set({ isRunning: true }),
      stop: () => set({ isRunning: false }),
      addLog: (message, type = 'info') =>
        set((s) => ({
          logs: [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: Date.now(),
              message,
              type,
            },
            ...s.logs,
          ].slice(0, 200),
        })),
      clearLogs: () => set({ logs: [] }),
      setLastFeed: (rows) => set({ lastFeed: rows.slice(0, 40) }),
      bumpCopied: (investUsd = 0) =>
        set((s) => ({
          copiedCount: s.copiedCount + 1,
          investedUsd: s.investedUsd + Math.max(0, investUsd),
        })),
      bumpScanned: (n) => set((s) => ({ scannedCount: s.scannedCount + n })),
      resetCounters: () => set({ copiedCount: 0, scannedCount: 0, investedUsd: 0 }),
    }),
    {
      name: 'copy-bet-storage',
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<CopyBetState>
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
        }
      },
    }
  )
)
