// See https://electronjs.org/docs/tutorial/context-isolation
// and https://www.electronjs.org/docs/api/context-bridge

export interface ElectronAPI {
  login: () => Promise<void>;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  getKeyAuthHwid: () => Promise<string>;
  getSessionToken: () => Promise<string | null>;
  proxyRequest: (options: { url: string; method?: string; headers?: Record<string, string>; body?: any }) => Promise<{ status: number; statusText: string; headers: any; data: string; finalUrl: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
