import { convertToUsd, normalizeCurrencyCode as normalizeCurrencyCodeCanonical } from '../../utils/monetaryContract';

export type LoggerCategory = 'casino' | 'sports';

export interface LoggerBetEntry {
  receivedAt: string;
  houseId?: string | null;
  betId?: string | null;
  iid?: string | null;
  betType?: string | null;
  gameName?: string | null;
  gameSlug?: string | null;
  amount: number | null;
  amountMajor?: number | null;
  amountMinor?: number | null;
  payout: number | null;
  payoutMajor?: number | null;
  payoutMinor?: number | null;
  currency?: string | null;
  payoutMultiplier?: number | null;
  amountMultiplier?: number | null;
  category?: LoggerCategory;
}

const CURRENCY_ALIASES: Record<string, string> = {
  bitcoin: 'btc',
  ethereum: 'eth',
  litecoin: 'ltc',
  dogecoin: 'doge',
  ripple: 'xrp',
  cardano: 'ada',
  bitcoincash: 'bch',
  bitcoin_cash: 'bch',
  solana: 'sol',
  tron: 'trx',
  tether: 'usdt',
  usdcoin: 'usdc',
};

export function normalizeCurrencyCode(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const compact = raw.replace(/[\s_-]+/g, '');
  return normalizeCurrencyCodeCanonical(CURRENCY_ALIASES[raw] || CURRENCY_ALIASES[compact] || raw);
}

export function getUsdRate(currency: unknown, rates: Record<string, number> = {}): number {
  const raw = String(currency || '').trim().toLowerCase();
  if (!raw) return 0;
  const normalized = normalizeCurrencyCode(raw);
  if (['usd', 'usdt', 'usdc'].includes(normalized)) return 1;

  const direct = Number(rates[raw]);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const normalizedDirect = Number(rates[normalized]);
  if (Number.isFinite(normalizedDirect) && normalizedDirect > 0) return normalizedDirect;

  for (const [key, value] of Object.entries(rates || {})) {
    if (normalizeCurrencyCode(key) === normalized) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return 0;
}

export function toUsd(amount: number | null | undefined, currency: unknown, rates: Record<string, number> = {}): number {
  if (amount == null || Number.isNaN(Number(amount))) return 0;
  const converted = convertToUsd(amount, currency, 'major', rates);
  return converted.usdAmount ?? 0;
}

export function getBetMultiplier(bet: Pick<LoggerBetEntry, 'payoutMultiplier' | 'amount' | 'payout'>): number | null {
  const direct = bet?.payoutMultiplier;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  const amount = Number(bet?.amount);
  const payout = Number(bet?.payout);
  if (Number.isFinite(amount) && amount > 0 && Number.isFinite(payout)) return payout / amount;
  return null;
}

export function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatBetIdForCopy(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('house:')) return `casino:${raw.slice(6)}`;
  return raw;
}
