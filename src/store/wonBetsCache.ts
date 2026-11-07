/**
 * Dauerhafter Cache gewonnener Sportwetten (über die ~300 Finished-API-Fenster hinaus).
 * Local snapshots and migration from the old browser cache to the desktop archive.
 */
import type { SportBet, SportBetOutcome } from './userStore';
import { finishedBetBucket } from '../services/cashoutService';

const STORAGE_PREFIX = 'sports_won_bets_cache:';

export type CachedWonBet = {
  id: string;
  iid?: string;
  status: string;
  amount: number;
  currency: string;
  payout: number;
  payoutMultiplier: number;
  potentialMultiplier: number;
  createdAt: string;
  fixtureName?: string;
  pickName?: string;
  legsTotal?: number;
  outcomes?: SportBetOutcome[];
  cachedAt: number;
};

type CacheFile = { byId: Record<string, CachedWonBet> };

function storageKey(userName: string): string {
  return `${STORAGE_PREFIX}${String(userName || '').toLowerCase().trim() || 'anon'}`;
}

function load(userName: string): CacheFile {
  try {
    const raw = localStorage.getItem(storageKey(userName));
    if (!raw) return { byId: {} };
    const parsed = JSON.parse(raw);
    if (parsed?.byId && typeof parsed.byId === 'object') return { byId: parsed.byId };
  } catch {
    /* ignore */
  }
  return { byId: {} };
}

export function snapshotWonBet(bet: SportBet, previous?: CachedWonBet): CachedWonBet | null {
  if (!bet?.id || bet.active) return null;
  if (String(bet.status || '').toLowerCase().endsWith('pending')) return null;
  if (finishedBetBucket(bet) !== 'won') return null;
  const outcomes = bet.outcomes?.length ? bet.outcomes : previous?.outcomes ?? [];
  const first = outcomes[0];
  return {
    id: bet.id,
    iid: bet.iid ?? bet.bet?.iid ?? previous?.iid,
    status: String(bet.status || 'won'),
    amount: Number(bet.amount) || 0,
    currency: String(bet.currency || 'usd'),
    payout: Number(bet.payout) || 0,
    payoutMultiplier: Number(bet.payoutMultiplier) || Number(bet.potentialMultiplier) || 0,
    potentialMultiplier: Number(bet.potentialMultiplier) || Number(bet.payoutMultiplier) || 0,
    createdAt: String(bet.createdAt || previous?.createdAt || new Date().toISOString()),
    fixtureName: first?.fixture?.name ?? previous?.fixtureName,
    pickName: first?.outcome?.name ?? previous?.pickName,
    legsTotal: outcomes.length || previous?.legsTotal,
    outcomes: outcomes.length ? outcomes.map(({ id, odds, status, outcome, market, fixture }) => ({
      id, odds, status, outcome, market,
      fixture: { id: fixture?.id, name: fixture?.name, status: fixture?.status },
    })) : undefined,
    cachedAt: previous?.cachedAt ?? Date.now(),
  };
}

function syntheticOutcomes(entry: CachedWonBet): SportBetOutcome[] {
  const n = Math.max(1, Number(entry.legsTotal) || 1);
  const fixtureName = entry.fixtureName || 'Cached win';
  const pickName = entry.pickName || 'Won';
  const out: SportBetOutcome[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${entry.id}-cached-leg-${i}`,
      odds: 1,
      status: 'won',
      outcome: { id: `${entry.id}-o-${i}`, odds: 1, name: i === 0 ? pickName : '' },
      market: { id: `${entry.id}-m-${i}`, name: '', status: 'settled' },
      fixture: { id: `${entry.id}-f-${i}`, name: i === 0 ? fixtureName : 'Saved leg', status: 'ended' },
    });
  }
  return out;
}

export function cachedWonToSportBet(entry: CachedWonBet): SportBet {
  return {
    id: entry.id,
    iid: entry.iid,
    active: false,
    status: entry.status || 'won',
    customBet: false,
    cashoutDisabled: true,
    amount: entry.amount,
    currency: entry.currency,
    payout: entry.payout,
    potentialMultiplier: entry.potentialMultiplier,
    payoutMultiplier: entry.payoutMultiplier,
    cashoutMultiplier: 0,
    createdAt: entry.createdAt,
    user: { id: '' },
    outcomes: entry.outcomes?.length ? entry.outcomes : syntheticOutcomes(entry),
  };
}

export function readLegacyWonBets(userName: string): CachedWonBet[] {
  return Object.values(load(userName).byId).filter((entry) => typeof entry?.id === 'string' && entry.id);
}

export async function loadArchivedWonBets(userName: string, legacy: CachedWonBet[]) {
  const api = window.electronAPI;
  if (!api?.loadWonSportBets || !api.saveWonSportBets) return { entries: legacy, migrationFailed: false };
  const archived = await api.loadWonSportBets(userName);
  const ids = new Set(archived.map((entry) => entry.id));
  const missing = legacy.filter((entry) => !ids.has(entry.id));
  const entries = [...archived, ...missing];
  try {
    if (missing.length) await api.saveWonSportBets(userName, missing, true);
    return { entries, migrationFailed: false };
  } catch (error) {
    console.error('Could not migrate legacy won bets:', error);
    return { entries, migrationFailed: true };
  }
}

export async function saveWonBets(userName: string, entries: CachedWonBet[]): Promise<void> {
  if (!entries.length) return;
  const api = window.electronAPI;
  if (api?.saveWonSportBets) {
    await api.saveWonSportBets(userName, entries);
    return;
  }
  const existing = load(userName).byId;
  const byId = { ...existing, ...Object.fromEntries(entries.map((entry) => [entry.id, entry])) };
  localStorage.setItem(storageKey(userName), JSON.stringify({ byId }));
}

export async function migrateLegacyWonBetsBeforeReset(): Promise<void> {
  const api = window.electronAPI;
  if (!api?.saveWonSportBets) return;
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_PREFIX));
  for (const key of keys) {
    const name = key.slice(STORAGE_PREFIX.length);
    const entries = readLegacyWonBets(name);
    if (entries.length) await api.saveWonSportBets(name, entries, true);
  }
}
