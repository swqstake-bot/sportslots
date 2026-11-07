import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ArchivedWonBet = Record<string, unknown> & { id: string };

const BATCH_SIZE = 32;
const REQUIRED_TEXT_FIELDS = ['status', 'currency', 'createdAt'];
const REQUIRED_NUMBER_FIELDS = ['amount', 'payout', 'payoutMultiplier', 'potentialMultiplier', 'cachedAt'];
const OPTIONAL_TEXT_FIELDS = ['iid', 'fixtureName', 'pickName'];
const pendingSaves = new Map<string, Promise<void>>();

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function archiveDirectory(userData: string, userName: unknown): string {
  if (typeof userName !== 'string' || userName.length > 1024) {
    throw new TypeError('Invalid sport archive account');
  }
  const account = userName.toLowerCase().trim() || 'anon';
  return path.join(userData, 'sport-won-archive', hashKey(account));
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArchivedWonBet(value: unknown): value is ArchivedWonBet {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return false;
  return REQUIRED_TEXT_FIELDS.every((key) => typeof value[key] === 'string') &&
    REQUIRED_NUMBER_FIELDS.every((key) => Number.isFinite(value[key])) &&
    OPTIONAL_TEXT_FIELDS.every((key) => value[key] == null || typeof value[key] === 'string') &&
    (value.legsTotal == null || (typeof value.legsTotal === 'number' &&
      Number.isSafeInteger(value.legsTotal) && value.legsTotal >= 0)) &&
    (value.outcomes == null || (Array.isArray(value.outcomes) && value.outcomes.every(isRecord)));
}

async function inBatches<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = items.slice(offset, offset + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(run));
    for (const result of settled) {
      if (result.status === 'rejected') throw result.reason;
      results.push(result.value);
    }
  }
  return results;
}

async function readSnapshot(file: string): Promise<ArchivedWonBet | null> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
  try {
    const entry: unknown = JSON.parse(content);
    return isArchivedWonBet(entry) ? entry : null;
  } catch {
    return null;
  }
}

async function writeSnapshot(dir: string, entry: ArchivedWonBet, onlyMissing: boolean): Promise<void> {
  const file = path.join(dir, `${hashKey(entry.id)}.json`);
  const previous = await readSnapshot(file);
  const snapshot = { ...entry };
  if (previous) {
    if (previous.id !== entry.id) throw new Error('Sport archive snapshot has a mismatched ID');
    if (onlyMissing) return;
    if (!snapshot.iid && previous.iid) snapshot.iid = previous.iid;
    if ((!Array.isArray(snapshot.outcomes) || snapshot.outcomes.length === 0) &&
      Array.isArray(previous.outcomes) && previous.outcomes.length > 0) {
      snapshot.outcomes = previous.outcomes;
    }
    // A new cache timestamp alone does not change the stored slip.
    const before = JSON.stringify({ ...previous, cachedAt: undefined });
    const after = JSON.stringify({ ...snapshot, cachedAt: undefined });
    if (before === after) return;
  }

  const temp = path.join(dir, `${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx', mode: 0o600, flush: true });
    if (onlyMissing) {
      // Exclusive publication protects richer data written by another app process during migration.
      try {
        await link(temp, file);
      } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) throw error;
        const existing = await readSnapshot(file);
        if (existing?.id !== entry.id) throw new Error('Existing sport archive snapshot is invalid');
      }
    } else {
      await rename(temp, file);
    }
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

export async function loadWonSportBets(userData: string, userName: unknown): Promise<ArchivedWonBet[]> {
  const dir = archiveDirectory(userData, userName);
  await pendingSaves.get(dir)?.catch(() => {});
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }
  const slipFiles = files.filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
  const snapshots = await inBatches(slipFiles, (name) => readSnapshot(path.join(dir, name)));
  return snapshots.filter((entry) => entry !== null);
}

export async function saveWonSportBets(
  userData: string,
  userName: unknown,
  entries: unknown,
  onlyMissing: unknown = false,
): Promise<void> {
  const dir = archiveDirectory(userData, userName);
  if (!Array.isArray(entries) || typeof onlyMissing !== 'boolean') {
    throw new TypeError('Invalid sport archive entries');
  }
  const snapshots = new Map<string, ArchivedWonBet>();
  for (const entry of entries) {
    if (!isArchivedWonBet(entry)) throw new TypeError('Invalid sport archive snapshot');
    // Check serializability before the first write, including any optional leg metadata.
    JSON.stringify(entry);
    if (!onlyMissing || !snapshots.has(entry.id)) snapshots.set(entry.id, entry);
  }
  if (!snapshots.size) return;

  // Keep saves from this process in order. Per-slip files also protect distinct IDs across processes.
  const previous = pendingSaves.get(dir) ?? Promise.resolve();
  const save = previous.catch(() => {}).then(async () => {
    await mkdir(dir, { recursive: true });
    await inBatches([...snapshots.values()], (entry) => writeSnapshot(dir, entry, onlyMissing));
  });
  pendingSaves.set(dir, save);
  try {
    await save;
  } finally {
    if (pendingSaves.get(dir) === save) pendingSaves.delete(dir);
  }
}
