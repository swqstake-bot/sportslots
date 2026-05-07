import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type InAppNotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export type InAppNotificationItem = {
  id: string
  ts: number
  source: string
  kind: string
  title: string
  body?: string
  read: boolean
  severity: InAppNotificationSeverity
  meta?: Record<string, unknown>
}

interface InAppNotificationState {
  items: InAppNotificationItem[]
  push: (item: Omit<InAppNotificationItem, 'id' | 'ts' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

const MAX_ITEMS = 250

export const useInAppNotificationStore = create<InAppNotificationState>()(
  persist(
    (set) => ({
      items: [],
      push: (item) =>
        set((state) => {
          const next: InAppNotificationItem = {
            id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            ts: Date.now(),
            read: false,
            ...item,
          }
          return { items: [next, ...state.items].slice(0, MAX_ITEMS) }
        }),
      markRead: (id) =>
        set((state) => ({
          items: state.items.map((x) => (x.id === id ? { ...x, read: true } : x)),
        })),
      markAllRead: () =>
        set((state) => ({
          items: state.items.map((x) => (x.read ? x : { ...x, read: true })),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'in-app-notification-storage',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
