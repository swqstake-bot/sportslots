// See https://electronjs.org/docs/tutorial/context-isolation
// and https://www.electronjs.org/docs/api/context-bridge

export interface ElectronAPI {
  getStakeSessionStatus: () => Promise<{
    valid: boolean;
    origin: string;
    checkedAt: string;
    reasons: string[];
    missingCookies: string[];
    expiredCookies: string[];
    sessionToken: string | null;
  }>;
  revalidateStakeSession: () => Promise<{
    valid: boolean;
    origin: string;
    checkedAt: string;
    reasons: string[];
    missingCookies: string[];
    expiredCookies: string[];
    sessionToken: string | null;
  }>;
  login: () => Promise<void>;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  getKeyAuthHwid: () => Promise<string>;
  getSessionToken: () => Promise<string | null>;
  fetchLoggerCurrencyRates: () => Promise<Record<string, number>>;
  saveLoggerBet: (entry: any) => Promise<string | null>;
  loadLoggerBetLogs: (options?: { limit?: number; fromDate?: string; toDate?: string }) => Promise<any[]>;
  getLoggerLogsDir: () => Promise<string>;
  exportLoggerBetLogs: (bets: any[]) => Promise<{ ok: boolean; cancelled?: boolean; path?: string; error?: string }>;
  importLoggerBetLogs: () => Promise<{ ok: boolean; cancelled?: boolean; bets?: any[]; saved?: boolean; error?: string }>;
  deleteAllLoggerBetLogs: () => Promise<{ ok: boolean; deleted?: number; error?: string }>;
  openSlotPopup: (payload: { slug: string; locale?: string }) => Promise<{ ok: boolean; url?: string; popupId?: string; error?: string }>;
  openStakeWithdrawPrefill: (payload: {
    address: string;
    currency: string;
    chain?: string;
    locale?: string;
  }) => Promise<{
    ok: boolean;
    url?: string;
    filled?: boolean;
    error?: string;
    reasons?: string[];
  }>;
  onSlotPopupClosed: (callback: (payload: { popupId: string; slug: string; closedAt: string }) => void) => () => void;
  proxyRequest: (options: { url: string; method?: string; headers?: Record<string, string>; body?: any }) => Promise<{ status: number; statusText: string; headers: any; data: string; finalUrl: string }>;
  saveSlotSpinSample: (payload: { slotSlug: string; slotName?: string; providerId?: string; request: any; response: any }) => Promise<void>;
  getSlotSpinSamples: () => Promise<Record<string, any[]>>;
  getSpinSamplesDir: () => Promise<string>;
  clearSlotSpinSamples: () => Promise<void>;
  saveSlotFirstWinIfNeeded: (payload: {
    slotSlug: string;
    slotName?: string;
    providerId?: string;
    providerGroupSlug?: string | null;
    betAmountMinor?: number;
    winAmountMinor?: number;
    currency?: string;
    multiplier?: number;
    roundId?: string | null;
    shareBetId?: string | null;
    betAmountApiRaw?: number | null;
    payoutApiRaw?: number | null;
    payoutFromMultiplierApiRaw?: number | null;
  }) => Promise<{ saved: boolean; path?: string; csvPath?: string; slotCsvPath?: string }>;
  getSlotFirstWinsDir: () => Promise<string>;
  /** Telegram GramJS (Main-Prozess): siehe IPC-Namen in electron/main.ts */
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

