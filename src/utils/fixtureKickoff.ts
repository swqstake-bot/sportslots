/** Local-calendar kickoff window for Sports Autobet (Only today / until date). */

export function endOfLocalDayMs(year: number, monthIndex: number, day: number): number {
  return new Date(year, monthIndex, day, 23, 59, 59, 999).getTime();
}

export function startOfLocalDayMs(year: number, monthIndex: number, day: number): number {
  return new Date(year, monthIndex, day, 0, 0, 0, 0).getTime();
}

export function parseLocalDateYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function getKickoffWindowBounds(
  settings: { onlyToday?: boolean; maxKickoffDate?: string },
  now = new Date()
): { minMs: number | null; maxMs: number | null } {
  if (settings.onlyToday) {
    return {
      minMs: startOfLocalDayMs(now.getFullYear(), now.getMonth(), now.getDate()),
      maxMs: endOfLocalDayMs(now.getFullYear(), now.getMonth(), now.getDate()),
    };
  }
  const parsed = parseLocalDateYmd(settings.maxKickoffDate || '');
  if (!parsed) return { minMs: null, maxMs: null };
  return {
    minMs: null,
    maxMs: endOfLocalDayMs(parsed.y, parsed.m, parsed.d),
  };
}

export function fixturePassesKickoffWindow(
  fixtureStartTimeMs: number,
  bounds: { minMs: number | null; maxMs: number | null }
): boolean {
  if (bounds.minMs == null && bounds.maxMs == null) return true;
  if (
    !Number.isFinite(fixtureStartTimeMs) ||
    fixtureStartTimeMs <= 0 ||
    fixtureStartTimeMs >= Number.MAX_SAFE_INTEGER
  ) {
    return false;
  }
  if (bounds.minMs != null && fixtureStartTimeMs < bounds.minMs) return false;
  if (bounds.maxMs != null && fixtureStartTimeMs > bounds.maxMs) return false;
  return true;
}

export function formatKickoffWindowLog(
  settings: { onlyToday?: boolean; maxKickoffDate?: string }
): string | null {
  if (settings.onlyToday) return 'Kickoff: only today (local)';
  const raw = String(settings.maxKickoffDate || '').trim();
  if (!raw || !parseLocalDateYmd(raw)) return null;
  return `Kickoff: until ${raw} (local)`;
}
