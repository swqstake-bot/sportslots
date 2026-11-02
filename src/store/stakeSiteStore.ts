import { create } from 'zustand'

export type StakePreferredSite = 'com' | 'eu'

interface StakeSiteState {
  preferredSite: StakePreferredSite
  setPreferredSite: (site: StakePreferredSite | string) => void
  /** Mirror der Classic-Plattform: 'auto' oder Hostname (z. B. stake3114.com). */
  mirror: string
  setMirror: (mirror: string) => void
}

export const useStakeSiteStore = create<StakeSiteState>((set) => ({
  preferredSite: 'com',
  setPreferredSite: (site) =>
    set({ preferredSite: String(site || '').trim().toLowerCase() === 'eu' ? 'eu' : 'com' }),
  mirror: 'auto',
  setMirror: (mirror) => set({ mirror: String(mirror || '').trim().toLowerCase() || 'auto' }),
}))

/** Sync preferred site from Electron (mount + session revalidate). */
export async function refreshStakeSiteFromMain(): Promise<StakePreferredSite> {
  try {
    const statuses = await window.electronAPI?.getStakeSiteStatuses?.()
    const site = statuses?.preferredSite === 'eu' ? 'eu' : 'com'
    useStakeSiteStore.getState().setPreferredSite(site)
    if (statuses?.mirror) useStakeSiteStore.getState().setMirror(statuses.mirror)
    return site
  } catch {
    return useStakeSiteStore.getState().preferredSite
  }
}
