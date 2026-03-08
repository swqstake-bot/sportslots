// See https://electronjs.org/docs/tutorial/context-isolation
// and https://www.electronjs.org/docs/api/context-bridge

export interface ElectronAPI {
  login: () => Promise<void>;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  getKeyAuthHwid: () => Promise<string>;
  getSessionToken: () => Promise<string | null>;
  proxyRequest: (options: { url: string; method?: string; headers?: Record<string, string>; body?: any }) => Promise<{ status: number; statusText: string; headers: any; data: string; finalUrl: string }>;
  saveSlotSpinSample: (payload: { slotSlug: string; slotName?: string; providerId?: string; request: any; response: any }) => Promise<void>;
  getSlotSpinSamples: () => Promise<Record<string, any[]>>;
  getSpinSamplesDir: () => Promise<string>;
  clearSlotSpinSamples: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
