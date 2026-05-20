import type { LoggerBetEntry } from './loggerUtils';
import { inferLoggerCategory } from './loggerUtils';

export const LOGGER_BET_SAVED_EVENT = 'logger-bet-saved';
export const MAX_LOGGER_BETS = 5000;

function betRowKey(b: LoggerBetEntry): string {
  return `${String(b.iid ?? b.houseId ?? b.betId)}\u0001${b.receivedAt}`;
}

export function normalizeLoggerBetEntry(raw: unknown): LoggerBetEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (b.houseId == null && b.iid == null && b.betId == null && b.receivedAt == null) return null;
  return {
    ...(b as unknown as LoggerBetEntry),
    category: inferLoggerCategory(b),
  };
}

/** Insert or replace one bet; newest rows first; cap list length. */
export function mergeLoggerBetIntoList(
  list: LoggerBetEntry[],
  entry: LoggerBetEntry,
  maxLen = MAX_LOGGER_BETS
): LoggerBetEntry[] {
  const key = betRowKey(entry);
  const idx = list.findIndex((b) => betRowKey(b) === key);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = entry;
    return next;
  }
  const next = [entry, ...list];
  return next.length > maxLen ? next.slice(0, maxLen) : next;
}

export function dispatchLoggerBetSaved(entry: LoggerBetEntry): void {
  try {
    window.dispatchEvent(new CustomEvent(LOGGER_BET_SAVED_EVENT, { detail: entry }));
  } catch {
    // Best-effort UI hint.
  }
}
