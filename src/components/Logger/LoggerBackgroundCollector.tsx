import { useEffect } from 'react';
import { subscribeToHouseBets } from '../Casino/api/stakeRealtimeFacade';
import { Queries } from '../../api/queries';
import { createEventEnvelope } from '../../utils/eventEnvelope';
import { inferLoggerCategory } from './loggerUtils';

function publishLoggerStatus(status: 'connecting' | 'connected' | 'error' | 'idle', error = '') {
  try {
    const detail = { status, error, updatedAt: new Date().toISOString() };
    localStorage.setItem('logger_subscription_status', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('logger-subscription-status', { detail }));
  } catch {
    // Status updates are best-effort UI hints.
  }
}

function mapLoggerEntry(b: any) {
  return {
    receivedAt: b?.receivedAt || new Date().toISOString(),
    houseId: b?.houseId ?? null,
    betId: b?.betId ?? null,
    iid: b?.iid ?? null,
    betType: b?.betType ?? null,
    gameName: b?.gameName ?? null,
    gameSlug: b?.gameSlug ?? null,
    amount: b?.amount != null ? Number(b.amount) : null,
    amountMajor: b?.amountMajor != null ? Number(b.amountMajor) : null,
    amountMinor: b?.amountMinor != null ? Number(b.amountMinor) : null,
    payout: b?.payout != null ? Number(b.payout) : null,
    payoutMajor: b?.payoutMajor != null ? Number(b.payoutMajor) : null,
    payoutMinor: b?.payoutMinor != null ? Number(b.payoutMinor) : null,
    currency: b?.currency ? String(b.currency).toLowerCase() : null,
    payoutMultiplier: b?.payoutMultiplier != null ? Number(b.payoutMultiplier) : null,
    amountMultiplier: b?.amountMultiplier != null ? Number(b.amountMultiplier) : null,
    status: b?.status ?? null,
    category: inferLoggerCategory(b),
    eventSource: 'realtime.houseBets',
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
      publishLoggerStatus('connecting');
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        start().catch(() => {
          // ignore
        });
      }, 5000);
    };

    async function start() {
      if (cancelled || disconnectObj) return;
      publishLoggerStatus('connecting');
      const token = await window.electronAPI.getSessionToken();
      if (!token) {
        scheduleRetry();
        return;
      }
      const sub = await subscribeToHouseBets(token, (b: any) => {
        const entry = mapLoggerEntry(b);
        const envelope = createEventEnvelope('logger.houseBet.persist', entry);
        enrichSportsBetFromIid(entry)
          .then((enriched) => window.electronAPI.saveLoggerBet({ ...enriched, eventEnvelope: envelope }))
          .catch(() => window.electronAPI.saveLoggerBet({ ...entry, eventEnvelope: envelope }))
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
      publishLoggerStatus('connected');
    }

    start().catch((err) => {
      publishLoggerStatus('error', String(err?.message || err || 'Subscription failed'));
      scheduleRetry();
    });

    return () => {
      cancelled = true;
      publishLoggerStatus('idle');
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
