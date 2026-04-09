import type { LoggerBetEntry } from './loggerUtils';

/** Stable fingerprint for logger bet arrays — skips React state updates when polling returns the same data. */
export function loggerBetsIdentity(list: LoggerBetEntry[]): string {
  const n = list.length;
  if (n === 0) return '0';
  const parts: string[] = [`${n}`];
  for (let i = 0; i < n; i++) {
    const b = list[i];
    parts.push(`${String(b.iid ?? b.houseId ?? b.betId)}\u0001${b.receivedAt}`);
  }
  return parts.join('\u0002');
}
