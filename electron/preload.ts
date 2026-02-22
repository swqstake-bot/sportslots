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
    version: pkg.version
});
