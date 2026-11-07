import { create } from 'zustand';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { useStakeSiteStore } from './stakeSiteStore';
import { useUserStore, type SportBet } from './userStore';
import {
  cachedWonToSportBet,
  loadArchivedWonBets,
  readLegacyWonBets,
  saveWonBets,
  snapshotWonBet,
  type CachedWonBet,
} from './wonBetsCache';

const PAGE_SIZE = 50;
const REFRESH_WINDOW = 300;
const REFRESH_INTERVAL_MS = 120_000;
const FINISHED_STATUSES = [
  'settled', 'settledManual', 'settledPending', 'cancelPending',
  'cancelled', 'cashout', 'cashoutPending',
];

type Account = { id: string; name: string };
type FinishedHistory = {
  bets: SportBet[];
  savedWonCount: number;
  loading: boolean;
  error: string | null;
};
type Sync = {
  account: Account;
  archive: Map<string, CachedWonBet>;
  recent: Map<string, SportBet>;
  archiveLoaded: boolean;
  fetching: boolean;
};

const EMPTY_HISTORY: FinishedHistory = { bets: [], savedWonCount: 0, loading: false, error: null };
const useFinishedStore = create<{ account: Account | null; history: FinishedHistory }>(() => ({
  account: null,
  history: EMPTY_HISTORY,
}));
let activeSync: Sync | null = null;

export function useFinishedSportBets(userId?: string, userName?: string): FinishedHistory {
  return useFinishedStore((state) =>
    state.account?.id === userId && state.account?.name === userName ? state.history : EMPTY_HISTORY,
  );
}

function isCurrent(sync: Sync): boolean {
  const user = useUserStore.getState().user;
  return activeSync === sync && useStakeSiteStore.getState().preferredSite === 'com'
    && user?.id === sync.account.id && user.name === sync.account.name;
}

function publish(sync: Sync, loading: boolean, error: string | null = null) {
  if (!isCurrent(sync)) return;
  const bets = new Map<string, SportBet>();
  for (const entry of sync.archive.values()) bets.set(entry.id, cachedWonToSportBet(entry));
  for (const [id, bet] of sync.recent) bets.set(id, bet);
  useFinishedStore.setState({
    account: sync.account,
    history: { bets: [...bets.values()], savedWonCount: sync.archive.size, loading, error },
  });
}

async function refresh(sync: Sync) {
  if (sync.fetching || !isCurrent(sync)) return;
  sync.fetching = true;
  publish(sync, true);
  let archiveError = false;
  let fetchError = false;
  const recent = new Map<string, SportBet>();
  try {
    if (!sync.archiveLoaded) {
      try {
        const { entries, migrationFailed } = await loadArchivedWonBets(sync.account.name, [...sync.archive.values()]);
        if (!isCurrent(sync)) return;
        sync.archive = new Map(entries.map((entry) => [entry.id, entry]));
        sync.archiveLoaded = !migrationFailed;
        archiveError = migrationFailed;
        publish(sync, true);
      } catch (error) {
        archiveError = true;
        console.error('Could not load saved won bets:', error);
      }
    }

    for (let offset = 0; offset < REFRESH_WINDOW && isCurrent(sync); offset += PAGE_SIZE) {
      const result = await StakeApi.query<{
        user?: { id: string; sportBetList?: Array<{ iid?: string; bet?: SportBet } | null> };
      }>(Queries.FetchFinishedSportBets, {
        limit: PAGE_SIZE, offset, name: sync.account.name, status: FINISHED_STATUSES,
      });
      if (!isCurrent(sync)) return;
      const user = result.data?.user;
      if (user?.id !== sync.account.id || !Array.isArray(user.sportBetList)) {
        throw new Error('Finished bets response did not match the signed-in account');
      }
      const updates: CachedWonBet[] = [];
      for (const item of user.sportBetList) {
        const bet = item?.bet;
        if (!bet?.id || recent.has(bet.id)) continue;
        const slip = { ...bet, iid: bet.iid ?? bet.bet?.iid ?? item?.iid };
        recent.set(slip.id, slip);
        const previous = sync.archive.get(slip.id);
        const entry = snapshotWonBet(slip, previous);
        if (entry && JSON.stringify(entry) !== JSON.stringify(previous)) updates.push(entry);
      }
      try {
        await saveWonBets(sync.account.name, updates);
        for (const entry of updates) sync.archive.set(entry.id, entry);
      } catch (error) {
        archiveError = true;
        console.error('Could not save won bets:', error);
      }
      if (user.sportBetList.length < PAGE_SIZE) break;
      if (offset + PAGE_SIZE < REFRESH_WINDOW) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    fetchError = true;
    console.error('Could not refresh finished bets:', error);
  } finally {
    sync.fetching = false;
    if (isCurrent(sync)) {
      sync.recent = fetchError ? new Map([...sync.recent, ...recent]) : recent;
      const error = archiveError ? 'Some saved wins could not be loaded or saved. Try refreshing.'
        : fetchError ? 'Could not refresh finished bets. Showing saved and previously loaded slips.' : null;
      publish(sync, false, error);
    }
  }
}

export function refreshFinishedSportBets() {
  if (activeSync) void refresh(activeSync);
}

export function startFinishedSportBetsSync(account: Account) {
  const sync: Sync = {
    account,
    archive: new Map(readLegacyWonBets(account.name).map((entry) => [entry.id, entry])),
    recent: new Map(),
    archiveLoaded: false,
    fetching: false,
  };
  activeSync = sync;
  void refresh(sync);
  const timer = setInterval(() => void refresh(sync), REFRESH_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    if (activeSync === sync) {
      activeSync = null;
      useFinishedStore.setState({ account: null, history: EMPTY_HISTORY });
    }
  };
}
