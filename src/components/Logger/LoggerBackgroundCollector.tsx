import { useEffect } from 'react';
import { subscribeToHouseBets } from '../Casino/api/stakeRealtimeFacade';
import { Queries } from '../../api/queries';

function mapLoggerEntry(b: any) {
  const slug = String(b?.gameSlug || '').toLowerCase();
  const gameName = String(b?.gameName || '').toLowerCase();
  const betType = String(b?.betType || '').toLowerCase();
  const ids = `${String(b?.houseId || '')} ${String(b?.iid || '')} ${String(b?.betId || '')}`.toLowerCase();
  const isSports =
    slug.includes('sportsbook') ||
    gameName.includes('sportsbook') ||
    betType.includes('sport') ||
    ids.includes('sport:');
  return {
    receivedAt: b?.receivedAt || new Date().toISOString(),
    houseId: b?.houseId ?? null,
    betId: b?.betId ?? null,
    iid: b?.iid ?? null,
    betType: b?.betType ?? null,
    gameName: b?.gameName ?? null,
    gameSlug: b?.gameSlug ?? null,
    amount: b?.amount != null ? Number(b.amount) : null,
    payout: b?.payout != null ? Number(b.payout) : null,
    currency: b?.currency ? String(b.currency).toLowerCase() : null,
    payoutMultiplier: b?.payoutMultiplier != null ? Number(b.payoutMultiplier) : null,
    amountMultiplier: b?.amountMultiplier != null ? Number(b.amountMultiplier) : null,
    category: isSports ? 'sports' : 'casino',
  };
}

async function enrichSportsBetFromIid(entry: any) {
  const iid = String(entry?.iid || entry?.houseId || '').trim();
  const needsEnrichment = entry?.category === 'sports' && (!entry?.currency || entry?.amount == null || entry?.payout == null);
  if (!needsEnrichment || !iid) return entry;
  try {
    const res = await window.electronAPI.invoke('api-request', {
      query: Queries.PreviewCashout,
      variables: { iid },
      operationName: 'PreviewCashout',
    });
    const bet = res?.data?.bet?.bet;
    if (!bet || typeof bet !== 'object') return entry;
    const amount = Number((bet as any).amount);
    const payout = Number((bet as any).payout);
    const currencyRaw = String((bet as any).currency || '').toLowerCase();
    return {
      ...entry,
      amount: Number.isFinite(amount) ? amount : entry.amount,
      payout: Number.isFinite(payout) ? payout : entry.payout,
      currency: currencyRaw || entry.currency,
    };
  } catch {
    return entry;
  }
}

export default function LoggerBackgroundCollector() {
  useEffect(() => {
    let cancelled = false;
    let disconnectObj: { disconnect: () => void } | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        start().catch(() => {
          // ignore
        });
      }, 5000);
    };

    async function start() {
      if (cancelled || disconnectObj) return;
      const token = await window.electronAPI.getSessionToken();
      if (!token) {
        scheduleRetry();
        return;
      }
      const sub = await subscribeToHouseBets(token, (b: any) => {
        const entry = mapLoggerEntry(b);
        enrichSportsBetFromIid(entry)
          .then((enriched) => window.electronAPI.saveLoggerBet(enriched))
          .catch(() => window.electronAPI.saveLoggerBet(entry))
          .catch(() => {});
      });
      if (cancelled) {
        try {
          sub?.disconnect?.();
        } catch {
          // ignore
        }
        return;
      }
      disconnectObj = sub;
    }

    start().catch(() => scheduleRetry());

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        disconnectObj?.disconnect?.();
      } catch {
        // ignore
      }
      disconnectObj = null;
    };
  }, []);

  return null;
}
