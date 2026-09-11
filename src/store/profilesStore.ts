import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AutoBetSettings } from './autoBetStore';
import type { CopyBetSettings } from './copyBetStore';

export interface CasinoProfile {
  useSharedCurrency: boolean;
  sharedSourceCurrency: string;
  sharedTargetCurrency: string;
  sharedCryptoOnly: boolean;
}

export interface BotProfile {
  id: string;
  name: string;
  createdAt: number;
  autoBet?: Partial<AutoBetSettings>;
  copyBet?: Partial<CopyBetSettings>;
  casino?: Partial<CasinoProfile>;
}

interface ProfilesState {
  profiles: BotProfile[];
  saveProfile: (name: string, data: { autoBet?: Partial<AutoBetSettings>; copyBet?: Partial<CopyBetSettings>; casino?: Partial<CasinoProfile> }) => void;
  loadProfile: (id: string) => BotProfile | undefined;
  deleteProfile: (id: string) => void;
  exportProfiles: () => string;
  importProfiles: (json: string) => { success: boolean; imported: number; error?: string };
}

export const useProfilesStore = create<ProfilesState>()(
  persist(
    (set, get) => ({
      profiles: [],

      saveProfile: (name, data) => {
        const id = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const profile: BotProfile = {
          id,
          name,
          createdAt: Date.now(),
          ...data,
        };
        set((state) => ({
          profiles: [...state.profiles, profile],
        }));
      },

      loadProfile: (id) => {
        return get().profiles.find((p) => p.id === id);
      },

      deleteProfile: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        }));
      },

      exportProfiles: () => {
        return JSON.stringify({ profiles: get().profiles, version: 1 }, null, 2);
      },

      importProfiles: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data.profiles || !Array.isArray(data.profiles)) {
            return { success: false, imported: 0, error: 'Invalid format: missing profiles array' };
          }
          const imported = data.profiles.filter((p: any) => p.id && p.name);
          if (imported.length === 0) {
            return { success: false, imported: 0, error: 'No valid profiles found' };
          }
          set((state) => ({
            profiles: [...state.profiles, ...imported],
          }));
          return { success: true, imported: imported.length };
        } catch (err) {
          return { success: false, imported: 0, error: err instanceof Error ? err.message : 'Parse error' };
        }
      },
    }),
    {
      name: 'profiles-storage',
    }
  )
);
