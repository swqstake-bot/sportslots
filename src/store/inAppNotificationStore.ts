import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useUiStore, type ToastType } from './uiStore'

export type InAppNotificationSeverity = 'info' | 'success' | 'warning' | 'error'

function toastTypeFromSeverity(severity: InAppNotificationSeverity): ToastType {
  if (severity === 'error') return 'error'
  if (severity === 'success') return 'success'
  return 'info'
}

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
      push: (item) => {
        const next: InAppNotificationItem = {
          id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          ts: Date.now(),
          read: false,
          ...item,
        }
        set((state) => ({ items: [next, ...state.items].slice(0, MAX_ITEMS) }))
        const message = String(next.body || next.title || '').trim()
        if (message) {
          useUiStore.getState().showToast(message, toastTypeFromSeverity(next.severity))
        }
      },
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
