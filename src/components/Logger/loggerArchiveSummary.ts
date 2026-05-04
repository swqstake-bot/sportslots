/**
 * Lokale „Bet-Archive“-Auswertung (Stake HouseBets → Logger), angelehnt an SSP-Idee
 * bet-archive-list / bet-archive-analyze: gefilterte Liste + Kennzahlen + tabellarischer Export.
 * Kein Stake-GraphQL `BetArchive` nötig — Daten kommen aus JSONL + Realtime-Persist.
 */
import type { LoggerBetEntry } from './loggerUtils';
import { getBetMultiplier, toUsd } from './loggerUtils';

export type LoggerArchiveSummary = {
  count: number;
  stakeUsd: number;
  payoutUsd: number;
  netUsd: number;
  avgMulti: number | null;
  bestMulti: number | null;
};

export function computeLoggerArchiveSummary(
  bets: LoggerBetEntry[],
  currencyRates: Record<string, number>
): LoggerArchiveSummary {
  let stakeUsd = 0;
  let payoutUsd = 0;
  let best: number | null = null;
  let multiSum = 0;
  let multiCount = 0;
  for (const b of bets) {
    stakeUsd += toUsd(b.amount, b.currency, currencyRates);
    payoutUsd += toUsd(b.payout, b.currency, currencyRates);
    const m = getBetMultiplier(b);
    if (m != null && Number.isFinite(m)) {
      multiSum += m;
      multiCount++;
      if (best == null || m > best) best = m;
    }
  }
  const count = bets.length;
  return {
    count,
    stakeUsd,
    payoutUsd,
    netUsd: payoutUsd - stakeUsd,
    avgMulti: multiCount > 0 ? multiSum / multiCount : null,
    bestMulti: best,
  };
}

/** CSV-Zelle: Punkt als Dezimaltrennzeichen (Excel/Archiv-tauglich). */
function csvNum(n: number | null | undefined, decimals = 4): string {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toFixed(decimals);
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildLoggerBetsCsv(
  bets: LoggerBetEntry[],
  currencyRates: Record<string, number>
): string {
  const header = [
    'receivedAt',
    'houseId',
    'gameName',
    'gameSlug',
    'betType',
    'amount',
    'payout',
    'currency',
    'multiplier',
    'stakeUsd',
    'payoutUsd',
    'netUsd',
  ];
  const lines = [header.join(',')];
  for (const b of bets) {
    const m = getBetMultiplier(b);
    const stake = toUsd(b.amount, b.currency, currencyRates);
    const payout = toUsd(b.payout, b.currency, currencyRates);
    lines.push(
      [
        csvCell(b.receivedAt),
        csvCell(b.houseId ?? b.iid ?? b.betId ?? ''),
        csvCell(b.gameName),
        csvCell(b.gameSlug),
        csvCell(b.betType),
        csvCell(b.amount),
        csvCell(b.payout),
        csvCell(b.currency),
        csvCell(m != null ? csvNum(m, 6) : ''),
        csvCell(csvNum(stake, 4)),
        csvCell(csvNum(payout, 4)),
        csvCell(csvNum(payout - stake, 4)),
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}

export function downloadLoggerCsv(filename: string, csvBody: string): void {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
