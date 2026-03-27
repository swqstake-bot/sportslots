export type PreviewCashoutExtracted = {
  payout?: number;
  cashoutMultiplier?: number;
  cashoutDisabled?: boolean;
  amount?: number;
} | null;

/**
 * PreviewCashout: `data.bet` ist `Bet` mit Cashout unter `bet` (SportBet-Felder).
 * Fallback: flache Felder falls die API-Form sich ändert.
 */
export function extractSportBetFromPreviewResponse(root: unknown): PreviewCashoutExtracted {
  const r = root as Record<string, unknown> | null | undefined;
  if (!r) return null;
  const inner = r.bet as Record<string, unknown> | undefined;
  if (inner && (inner.cashoutMultiplier != null || inner.payout != null)) {
    return inner as { payout?: number; cashoutMultiplier?: number; cashoutDisabled?: boolean; amount?: number };
  }
  if (r.cashoutMultiplier != null || r.payout != null) {
    return r as { payout?: number; cashoutMultiplier?: number; cashoutDisabled?: boolean; amount?: number };
  }
  return null;
}

/** Volle GraphQL-Antwort + `data.bet` + Extrakt – in DevTools nach `[PreviewCashout:` filtern. */
export function logPreviewCashoutDebug(
  source: string,
  ctx: { betId?: string; iid?: string },
  fullResponse: unknown,
  rootBet?: unknown,
  extracted?: PreviewCashoutExtracted
): void {
  try {
    const safe = (v: unknown) => JSON.parse(JSON.stringify(v));
    console.log(`[PreviewCashout:${source}]`, {
      ...ctx,
      fullResponse: safe(fullResponse),
      dataBet: rootBet !== undefined ? safe(rootBet) : undefined,
      extracted: extracted !== undefined ? safe(extracted) : undefined,
    });
  } catch {
    console.log(`[PreviewCashout:${source}]`, { ...ctx, fullResponse, dataBet: rootBet, extracted });
  }
}
