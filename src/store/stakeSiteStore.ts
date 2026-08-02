import { create } from 'zustand'

export type StakePreferredSite = 'com' | 'eu'

interface StakeSiteState {
  preferredSite: StakePreferredSite
  setPreferredSite: (site: StakePreferredSite | string) => void
}

export const useStakeSiteStore = create<StakeSiteState>((set) => ({
  preferredSite: 'com',
  setPreferredSite: (site) =>
    set({ preferredSite: String(site || '').trim().toLowerCase() === 'eu' ? 'eu' : 'com' }),
}))

/** Sync preferred site from Electron (mount + session revalidate). */
export async function refreshStakeSiteFromMain(): Promise<StakePreferredSite> {
  try {
    const statuses = await window.electronAPI?.getStakeSiteStatuses?.()
    const site = statuses?.preferredSite === 'eu' ? 'eu' : 'com'
    useStakeSiteStore.getState().setPreferredSite(site)
    return site
  } catch {
    return useStakeSiteStore.getState().preferredSite
  }
}
