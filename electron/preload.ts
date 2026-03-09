import { contextBridge, ipcRenderer } from 'electron';
import pkg from '../package.json' with { type: 'json' };

contextBridge.exposeInMainWorld('electronAPI', {
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
    proxyRequest: (options: any) => ipcRenderer.invoke('proxy-request', options),
    version: pkg.version,
    // Slot Spin Samples – automatisches Lernen in Ordner
    saveSlotSpinSample: (payload: { slotSlug: string; slotName?: string; providerId?: string; request: any; response: any }) =>
        ipcRenderer.invoke('save-slot-spin-sample', payload),
    getSlotSpinSamples: () => ipcRenderer.invoke('get-slot-spin-samples'),
    getSpinSamplesDir: () => ipcRenderer.invoke('get-spin-samples-dir'),
    clearSlotSpinSamples: () => ipcRenderer.invoke('clear-slot-spin-samples'),
});
