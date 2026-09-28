/**
 * Dauerhafter Cache gewonnener Sportwetten (über die ~300 Finished-API-Fenster hinaus).
 * Keyed by userName; slim snapshots for list UI + permanent count.
 */
import type { SportBet, SportBetOutcome } from './userStore';
import { finishedBetBucket } from '../services/cashoutService';

const STORAGE_PREFIX = 'sports_won_bets_cache:';
/** Soft cap — prune oldest by createdAt when exceeded. */
const MAX_ENTRIES = 5000;

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

function save(userName: string, file: CacheFile) {
  try {
    localStorage.setItem(storageKey(userName), JSON.stringify(file));
  } catch {
    /* quota */
  }
}

function pruneIfNeeded(file: CacheFile): CacheFile {
  const ids = Object.keys(file.byId);
  if (ids.length <= MAX_ENTRIES) return file;
  const sorted = ids
    .map((id) => file.byId[id])
    .filter(Boolean)
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt) || a.cachedAt || 0;
      const tb = Date.parse(b.createdAt) || b.cachedAt || 0;
      return tb - ta;
    })
    .slice(0, MAX_ENTRIES);
  const byId: Record<string, CachedWonBet> = {};
  for (const e of sorted) byId[e.id] = e;
  return { byId };
}

function snapshotFromSportBet(bet: SportBet): CachedWonBet | null {
  if (!bet?.id) return null;
  if (finishedBetBucket(bet) !== 'won') return null;
  const outcomes = bet.outcomes ?? [];
  const first = outcomes[0];
  return {
    id: bet.id,
    iid: bet.iid ?? bet.bet?.iid,
    status: String(bet.status || 'won'),
    amount: Number(bet.amount) || 0,
    currency: String(bet.currency || 'usd'),
    payout: Number(bet.payout) || 0,
    payoutMultiplier: Number(bet.payoutMultiplier) || Number(bet.potentialMultiplier) || 0,
    potentialMultiplier: Number(bet.potentialMultiplier) || Number(bet.payoutMultiplier) || 0,
    createdAt: String(bet.createdAt || new Date().toISOString()),
    fixtureName: first?.fixture?.name,
    pickName: first?.outcome?.name,
    legsTotal: outcomes.length || undefined,
    cachedAt: Date.now(),
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
      fixture: { id: `${entry.id}-f-${i}`, name: i === 0 ? fixtureName : fixtureName, status: 'ended' },
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
    outcomes: syntheticOutcomes(entry),
  };
}

/** Upsert all API finished bets that bucket as won. Returns new permanent count. */
export function upsertWonBetsFromApi(userName: string, bets: SportBet[]): number {
  if (!userName) return 0;
  let file = load(userName);
  let changed = false;
  for (const bet of bets) {
    const snap = snapshotFromSportBet(bet);
    if (!snap) continue;
    const prev = file.byId[snap.id];
    if (
      !prev ||
      prev.payout !== snap.payout ||
      prev.status !== snap.status ||
      prev.amount !== snap.amount
    ) {
      file.byId[snap.id] = snap;
      changed = true;
    }
  }
  if (changed) {
    file = pruneIfNeeded(file);
    save(userName, file);
  }
  return Object.keys(file.byId).length;
}

export function getPermanentWonCount(userName: string): number {
  if (!userName) return 0;
  return Object.keys(load(userName).byId).length;
}

/** Cached wins not present in the current API window (newest first). */
export function listCachedWonMissingFromApi(userName: string, apiIds: Set<string>): SportBet[] {
  if (!userName) return [];
  const file = load(userName);
  return Object.values(file.byId)
    .filter((e) => e?.id && !apiIds.has(e.id))
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt) || a.cachedAt || 0;
      const tb = Date.parse(b.createdAt) || b.cachedAt || 0;
      return tb - ta;
    })
    .map(cachedWonToSportBet);
}

/**
 * Persist won from API window, then append older cached wins so the Won list
 * survives past the ~300 finished-bet API cap.
 */
export function mergeFinishedWithWonCache(userName: string, apiBets: SportBet[]): {
  bets: SportBet[];
  permanentWonCount: number;
} {
  const permanentWonCount = upsertWonBetsFromApi(userName, apiBets);
  const apiIds = new Set(apiBets.map((b) => b.id));
  const extras = listCachedWonMissingFromApi(userName, apiIds);
  return { bets: extras.length ? [...apiBets, ...extras] : apiBets, permanentWonCount };
}
