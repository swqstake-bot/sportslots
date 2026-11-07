import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateCreator } from 'zustand';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { refreshFinishedSportBets, startFinishedSportBetsSync, useFinishedSportBets } from './finishedSportBets';
import { useStakeSiteStore } from './stakeSiteStore';
import { useUserStore, type SportBet, type SportBetOutcome } from './userStore';
import type { CachedWonBet } from './wonBetsCache';

vi.mock('../api/client', () => ({ StakeApi: { query: vi.fn() } }));

vi.mock('zustand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand')>();
  return {
    ...actual,
    // Evaluate selectors outside React while exercising the real store transitions.
    create: <T,>(initialize: StateCreator<T>) => {
      const store = actual.create(initialize);
      const selectState = <U,>(select: (state: T) => U) => select(store.getState());
      return Object.assign(selectState, store);
    },
  };
});

const alice = { id: 'account-a', name: 'Alice' };
const bob = { id: 'account-b', name: 'Bob' };
const createdAt = '2026-11-01T10:00:00.000Z';
const query = vi.mocked(StakeApi.query);
const loadArchive = vi.fn<(name: string) => Promise<CachedWonBet[]>>();
const saveArchive = vi.fn<(name: string, entries: CachedWonBet[], onlyMissing?: boolean) => Promise<void>>();
const readStorage = vi.fn<(key: string) => string | null>();
const stopSyncs: (() => void)[] = [];

function savedWin(id: string, patch: Partial<CachedWonBet> = {}): CachedWonBet {
  return {
    id, status: 'settled', amount: 5, currency: 'usdc', payout: 15,
    payoutMultiplier: 3, potentialMultiplier: 3, createdAt, cachedAt: 1,
    ...patch,
  };
}

function leg(id: string, fixtureName: string, pickName: string, odds: number): SportBetOutcome {
  return {
    id, odds, status: 'won',
    outcome: { id: `${id}-pick`, odds, name: pickName },
    market: { id: `${id}-market`, name: 'Winner', status: 'settled' },
    fixture: { id: `${id}-fixture`, name: fixtureName, status: 'ended' },
  };
}

function finishedSlip(id: string, patch: Partial<SportBet> = {}): SportBet {
  return {
    id, active: false, status: 'settled', customBet: false, cashoutDisabled: true,
    amount: 5, currency: 'usdc', payout: 15, potentialMultiplier: 3,
    payoutMultiplier: 3, cashoutMultiplier: 0, createdAt,
    user: { id: alice.id }, outcomes: [], ...patch,
  };
}

type BetPageItem = { iid?: string; bet?: SportBet | null } | null;

function page(userId: string, sportBetList: BetPageItem[]) {
  return { data: { user: { id: userId, sportBetList } } };
}

function start(account: typeof alice) {
  const stop = startFinishedSportBetsSync(account);
  stopSyncs.push(stop);
  return stop;
}

function history(account = alice) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- The mocked Zustand hook evaluates selectors without React.
  return useFinishedSportBets(account.id, account.name);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  query.mockReset();
  loadArchive.mockReset().mockResolvedValue([]);
  saveArchive.mockReset().mockResolvedValue(undefined);
  readStorage.mockReset().mockReturnValue(null);
  vi.stubGlobal('window', { electronAPI: { loadWonSportBets: loadArchive, saveWonSportBets: saveArchive } });
  vi.stubGlobal('localStorage', { getItem: readStorage });
  useStakeSiteStore.setState({ preferredSite: 'com' });
  useUserStore.setState({ user: alice });
});

afterEach(() => {
  for (const stop of stopSyncs.splice(0).reverse()) stop();
  useUserStore.setState({ user: null });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('finished sports bets sync', () => {
  it.each([false, true])('shows disk and legacy wins after an API error (migration failed: %s)', async (migrationFailed) => {
    const legacy = savedWin('legacy-win');
    const archived = savedWin('archived-win', {
      payout: 25, outcomes: [leg('archived-leg', 'Home vs Away', 'Home', 5)],
    });
    readStorage.mockImplementation((key) => key === 'sports_won_bets_cache:alice' ? JSON.stringify({
      byId: { [legacy.id]: legacy, [archived.id]: savedWin(archived.id) },
    }) : null);
    loadArchive.mockResolvedValue([archived]);
    if (migrationFailed) saveArchive.mockRejectedValueOnce(new Error('Archive is read-only'));
    query.mockRejectedValueOnce(new Error('Offline'));

    start(alice);
    await vi.advanceTimersByTimeAsync(0);

    expect(loadArchive).toHaveBeenCalledExactlyOnceWith(alice.name);
    expect(saveArchive).toHaveBeenCalledExactlyOnceWith(alice.name, [legacy], true);
    expect(history()).toMatchObject({ savedWonCount: 2, loading: false, error: expect.any(String) });
    expect(history().bets).toHaveLength(2);
    expect(history().bets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: legacy.id }),
      expect.objectContaining({ id: archived.id, payout: archived.payout, outcomes: archived.outcomes }),
    ]));
  });

  it('archives unique wins with their share ID and legs before trying the next page', async () => {
    const outcomes = [leg('leg-one', 'First match', 'Home', 1.5), leg('leg-two', 'Second match', 'Away', 2)];
    const won = finishedSlip('page-one-win', { outcomes });
    const lost = finishedSlip('page-one-loss', { payout: 0 });
    const firstPage = [
      { iid: 'sport:shared-slip', bet: won }, { bet: won }, null, { bet: null }, { bet: lost },
      ...Array<null>(45).fill(null),
    ];
    query.mockResolvedValueOnce(page(alice.id, firstPage)).mockRejectedValueOnce(new Error('Page two failed'));

    start(alice);
    await vi.advanceTimersByTimeAsync(0);

    expect(query).toHaveBeenCalledExactlyOnceWith(Queries.FetchFinishedSportBets, expect.objectContaining({
      name: alice.name, offset: 0, limit: 50,
    }));
    expect(saveArchive).toHaveBeenCalledExactlyOnceWith(alice.name, [expect.objectContaining({
      id: won.id, iid: 'sport:shared-slip', legsTotal: 2, outcomes,
    })]);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(2, Queries.FetchFinishedSportBets, expect.objectContaining({ offset: 50 }));
    expect(history()).toMatchObject({ savedWonCount: 1, loading: false, error: expect.any(String) });
    expect(history().bets.map((bet) => bet.id).sort()).toEqual([lost.id, won.id]);
  });

  it('coalesces refreshes and ignores a late response after switching accounts', async () => {
    let finishAlice!: (result: ReturnType<typeof page>) => void;
    const aliceResponse = new Promise<ReturnType<typeof page>>((resolve) => { finishAlice = resolve; });
    const bobWin = finishedSlip('bob-win', { user: { id: bob.id } });
    query.mockImplementationOnce(() => aliceResponse).mockResolvedValueOnce(page(bob.id, [{ bet: bobWin }]));

    const stopAlice = start(alice);
    await vi.advanceTimersByTimeAsync(0);
    refreshFinishedSportBets();
    refreshFinishedSportBets();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(query).toHaveBeenCalledTimes(1);

    stopAlice();
    useUserStore.setState({ user: bob });
    start(bob);
    await vi.advanceTimersByTimeAsync(0);
    finishAlice(page(alice.id, [{ bet: finishedSlip('late-alice-win') }]));
    await vi.advanceTimersByTimeAsync(0);

    expect(query).toHaveBeenCalledTimes(2);
    expect(saveArchive).toHaveBeenCalledExactlyOnceWith(bob.name, [expect.objectContaining({ id: bobWin.id })]);
    expect(history(alice).bets).toEqual([]);
    expect(history(bob).bets.map((bet) => bet.id)).toEqual([bobWin.id]);
  });
});
