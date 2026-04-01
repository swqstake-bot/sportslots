import { contextBridge, ipcRenderer } from 'electron';
import pkg from '../package.json' with { type: 'json' };

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,
    version: pkg?.version ?? '',
    login: () => ipcRenderer.invoke('login'),
    // Expose invoke to allow calling 'api-request'
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (...args: any[]) => void) => {
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    getKeyAuthHwid: () => ipcRenderer.invoke('get-keyauth-hwid'),
    getSessionToken: () => ipcRenderer.invoke('get-session-token'),
    fetchLoggerCurrencyRates: () => ipcRenderer.invoke('logger-fetch-currency-rates'),
    saveLoggerBet: (entry: any) => ipcRenderer.invoke('logger-save-bet', entry),
    loadLoggerBetLogs: (options?: { limit?: number; fromDate?: string; toDate?: string }) => ipcRenderer.invoke('logger-load-bet-logs', options),
    getLoggerLogsDir: () => ipcRenderer.invoke('logger-get-logs-dir'),
    exportLoggerBetLogs: (bets: any[]) => ipcRenderer.invoke('logger-export-bet-logs', bets),
    importLoggerBetLogs: () => ipcRenderer.invoke('logger-import-bet-logs'),
    deleteAllLoggerBetLogs: () => ipcRenderer.invoke('logger-delete-all-bet-logs'),
    proxyRequest: (options: any) => ipcRenderer.invoke('proxy-request', options),
    extractClawbusterSecret: (configUrl: string) => ipcRenderer.invoke('clawbuster-extract-secret', configUrl),
    // Slot Spin Samples – automatisches Lernen in Ordner
    saveSlotSpinSample: (payload: { slotSlug: string; slotName?: string; providerId?: string; request: any; response: any }) =>
        ipcRenderer.invoke('save-slot-spin-sample', payload),
    getSlotSpinSamples: () => ipcRenderer.invoke('get-slot-spin-samples'),
    getSpinSamplesDir: () => ipcRenderer.invoke('get-spin-samples-dir'),
    clearSlotSpinSamples: () => ipcRenderer.invoke('clear-slot-spin-samples'),
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
    }) =>
        ipcRenderer.invoke(
            'save-slot-first-win-if-needed',
            payload
        ) as Promise<{ saved: boolean; path?: string; csvPath?: string; slotCsvPath?: string }>,
    getSlotFirstWinsDir: () => ipcRenderer.invoke('get-slot-first-wins-dir') as Promise<string>,
});
