/**
 * Holt die **aktuellen** Cashout-Daten von Stake (PreviewCashout) und schreibt sie in die Wettenliste.
 * Ergänzt die Live-Liste, die `cashoutMultiplier` bereits tragen kann – kein „Raten“, sondern API-Abfrage.
 */

import { useCallback, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { computeCashoutFromPreview } from '../services/cashoutService';
import { isCashoutDisabledByCustomPrices } from '../services/cashoutService';
import type { SportBet } from '../store/userStore';
import { extractSportBetFromPreviewResponse, logPreviewCashoutDebug } from '../utils/previewCashoutResponse';

/** Pause zwischen Batches paralleler PreviewCashout-Calls (Rate limits). */
const BATCH_DELAY_MS = 350;
/** Wie viele Previews parallel (pro Batch). */
const PARALLEL_BATCH_SIZE = 6;

function hasLiveLeg(bet: SportBet): boolean {
  return (bet.outcomes ?? []).some((o: any) => {
    const es = o?.fixture?.eventStatus;
    if (!es) return false;
    const ms = String(es.matchStatus ?? '').toLowerCase();
    if (ms === 'live' || ms === 'in_play' || ms === 'inplay') return true;
    if (es.clock != null) return true;
    return false;
  });
}

/** Live zuerst, dann neueste – sichtbare Top-Scheine bekommen Cashout schneller. */
function sortForCashoutPriority(bets: SportBet[]): SportBet[] {
  return [...bets].sort((a, b) => {
    const la = hasLiveLeg(a) ? 1 : 0;
    const lb = hasLiveLeg(b) ? 1 : 0;
    if (lb !== la) return lb - la;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });
}

export interface UseCashoutOffersOptions {
  activeBets: SportBet[];
  setActiveBets: (updater: SportBet[] | ((prev: SportBet[]) => SportBet[])) => void;
  onSingleBetProcessed?: (bet: SportBet) => void;
  enabled?: boolean;
}

/**
 * Führt für eine einzelne Wette einen Cashout-Preview-Request aus
 * und gibt die aktualisierte Wette zurück.
 */
async function processSingleBet(
  bet: SportBet
): Promise<SportBet> {
  if (bet?.customBet || isCashoutDisabledByCustomPrices(bet)) {
    return { ...bet, cashoutDisabled: true, cashoutMultiplier: bet.cashoutMultiplier || 0 };
  }

  const iid = bet?.bet?.iid;
  if (!iid) return { ...bet };

  try {
    const preview = await StakeApi.query<{ bet?: unknown }>(Queries.PreviewCashout, { iid });
    const root = preview?.data?.bet;
    const data = extractSportBetFromPreviewResponse(root);
    logPreviewCashoutDebug('batch', { betId: bet.id, iid }, preview, root, data);

    if (data) {
      const payout = Number(data.payout);
      const cm = Number(data.cashoutMultiplier);
      const hasPayout = Number.isFinite(payout) && payout > 0;
      const hasMultiplier = Number.isFinite(cm) && cm > 0;

      if (hasPayout || hasMultiplier) {
        const stakeBet = bet.amount != null && Number(bet.amount) > 0 ? Number(bet.amount) : 0;
        const stakePreview = data.amount != null && Number(data.amount) > 0 ? Number(data.amount) : 0;
        let mult = hasMultiplier ? cm : (bet.cashoutMultiplier ?? 0);
        if ((!mult || mult <= 0) && hasPayout && stakeBet > 0) {
          mult = payout / stakeBet;
        }
        const value = computeCashoutFromPreview(bet, { ...data, cashoutMultiplier: mult });
        const amountMerged =
          stakeBet > 0 ? bet.amount : stakePreview > 0 ? stakePreview : bet.amount;
        return {
          ...bet,
          ...(amountMerged != null && (bet.amount == null || Number(bet.amount) <= 0) ? { amount: amountMerged } : {}),
          cashoutMultiplier: mult,
          cashoutValue: value,
          cashoutDisabled: data.cashoutDisabled === true,
        };
      }
    }
  } catch (err) {
    console.error(`Cashout check failed for ${bet.id}`, err);
  }

  return { ...bet, cashoutMultiplier: bet.cashoutMultiplier || 0 };
}

/**
 * Lädt Cashout-Angebote für alle aktiven Wetten.
 * Verarbeitet wettenweise mit Verzögerung, um API-Limits zu schonen.
 */
export function useCashoutOffers({
  activeBets,
  setActiveBets,
  onSingleBetProcessed,
  enabled = true,
}: UseCashoutOffersOptions) {
  const isMountedRef = useRef(true);

  const refreshCashoutOffers = useCallback(
    async (source: SportBet[] = activeBets) => {
      if (!enabled || source.length === 0) return;

      const sorted = sortForCashoutPriority(source);

      for (let i = 0; i < sorted.length; i += PARALLEL_BATCH_SIZE) {
        if (!isMountedRef.current) return;
        const batch = sorted.slice(i, i + PARALLEL_BATCH_SIZE);
        const results = await Promise.all(batch.map(processSingleBet));
        for (const updated of results) {
          if (!updated || !isMountedRef.current) continue;
          setActiveBets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          onSingleBetProcessed?.(updated);
        }
        if (i + PARALLEL_BATCH_SIZE < sorted.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    },
    [activeBets, setActiveBets, onSingleBetProcessed, enabled]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { refreshCashoutOffers };
}
