import React, { useCallback, useMemo, useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { collectSportBetShareIds, joinSportBetShareIds } from '../../utils/stakeSportsUrl';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount } from '../../services/cashoutService';
import { formatStakeAmount } from '../../utils/formatStakeAmount';
import { convertToUsd } from '../../utils/monetaryContract';
import { computeDeterministicStats, replayStats } from '../../services/stats/statsEngine';
import { useSportsFxRates } from '../../hooks/useSportsFxRates';
import { rankActiveBetsByCashoutUsd, useTopActiveBetsCashout } from '../../hooks/useTopActiveBetsCashout';

const TOP_N = 15;

export const ActiveBetsList: React.FC = () => {
  const { activeBets } = useUserStore();
  const { openActiveBetsModal, showToast } = useUiStore();
  const { usdRates } = useSportsFxRates();
  const [top15Copied, setTop15Copied] = useState(false);

  useTopActiveBetsCashout({
    usdRates,
    enabled: Boolean(activeBets?.length),
    topN: TOP_N,
  });

  const formatUsdShort = (amount: number, currency: string): string => {
    const converted = convertToUsd(amount, currency, 'major', usdRates);
    const usd = converted.usdAmount ?? 0;
    return formatStakeAmount(usd, 'usd');
  };

  const topBetsModel = useMemo(() => {
    if (!activeBets?.length) return { bets: [], fxMissingCount: 0 };
    let missing = 0;
    const sorted = rankActiveBetsByCashoutUsd(activeBets, usdRates).slice(0, TOP_N);
    for (const bet of sorted) {
      const cashConv = convertToUsd(getCashoutValue(bet), bet.currency, 'major', usdRates);
      if (cashConv.fxStatus !== 'ok') missing += 1;
    }
    return { bets: sorted, fxMissingCount: missing };
  }, [activeBets, usdRates]);
  const topBets = topBetsModel.bets;
  const fxMissingCount = topBetsModel.fxMissingCount;
  const top15ShareIds = useMemo(() => collectSportBetShareIds(topBets), [topBets]);

  const copyTop15Ids = useCallback(() => {
    const text = joinSportBetShareIds(top15ShareIds);
    if (!text) {
      showToast('No bet IDs in Top 15', 'info');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setTop15Copied(true);
        setTimeout(() => setTop15Copied(false), 2000);
        showToast(`Copied ${top15ShareIds.length} bet ID(s)`, 'success');
      })
      .catch(() => showToast('Copy failed', 'error'));
  }, [top15ShareIds, showToast]);
  const sportsStats = useMemo(
    () =>
      computeDeterministicStats(
        (activeBets || []).map((b) => ({
          amount: Number(b?.amount || 0),
          payout: Number(b?.payout || 0),
          currency: String(b?.currency || ''),
        })),
        usdRates
      ),
    [activeBets, usdRates]
  );
  const sportsReplay = useMemo(
    () =>
      replayStats(
        (activeBets || []).map((b) => ({
          amount: Number(b?.amount || 0),
          payout: Number(b?.payout || 0),
          currency: String(b?.currency || ''),
        })),
        usdRates
      ),
    [activeBets, usdRates]
  );
  const replayNet = sportsReplay.length > 0 ? sportsReplay[sportsReplay.length - 1].netUsd : 0;
  const netDelta = replayNet - sportsStats.netUsd;
  const netColor = sportsStats.netUsd >= 0 ? 'var(--app-accent)' : 'var(--app-error)';

  if (!activeBets) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--app-bg-deep)' }}>
      <div className="p-2 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)' }}>
        <button
          onClick={() => openActiveBetsModal(null)}
          className="w-full rounded-lg py-2 px-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 border hover:border-[var(--app-accent)] hover:bg-[rgba(var(--app-accent-rgb),0.08)] hover:text-[var(--app-text)]"
          style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          All Bets ({activeBets.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {activeBets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--app-text-muted)', opacity: 0.8 }}>
            <svg className="w-10 h-10 mb-2" style={{ color: 'var(--app-border)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">No Active Bets</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-1 mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                Top 15 (Cashout → Legs)
              </p>
              <button
                type="button"
                onClick={copyTop15Ids}
                disabled={top15ShareIds.length === 0}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border transition-colors hover:opacity-90 disabled:opacity-40"
                style={{
                  color: top15Copied ? 'var(--app-accent)' : 'var(--app-text-muted)',
                  borderColor: 'var(--app-border)',
                  background: 'var(--app-bg-deep)',
                }}
                title={top15ShareIds.length ? top15ShareIds.join(' ') : 'No sport: IDs'}
              >
                {top15Copied ? 'Copied' : 'Copy Top 15'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1 px-1 mb-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded border" style={{ color: netColor, borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
                Net ${sportsStats.netUsd.toFixed(2)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded border" style={{ color: 'var(--app-text-muted)', borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
                ROI {sportsStats.roiPercent.toFixed(2)}%
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded border" style={{ color: 'var(--app-text-muted)', borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
                FX {sportsStats.fxCoveragePercent.toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] px-1 mb-1.5" style={{ color: Math.abs(netDelta) > 0.01 ? 'var(--app-warning)' : 'var(--app-text-muted)' }}>
              Replay Net: ${replayNet.toFixed(2)} {Math.abs(netDelta) > 0.01 ? `(Δ ${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(2)})` : '(sync)'}
            </div>
            {fxMissingCount > 0 && (
              <p className="text-[10px] px-1 mb-1.5" style={{ color: 'var(--app-warning)' }}>
                FX-Hinweis: {fxMissingCount} Bewertung(en) ohne Rate.
              </p>
            )}
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)' }}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b" style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                    <th className="py-1.5 px-2 font-bold w-6">#</th>
                    <th className="py-1.5 px-2 font-bold truncate max-w-[100px]">Fixture</th>
                    <th className="py-1.5 px-1 font-bold text-right w-10">Odds</th>
                    <th className="py-1.5 px-2 font-bold text-right w-12">Cashout</th>
                    <th className="py-1.5 px-2 font-bold text-center w-10">Legs</th>
                  </tr>
                </thead>
                <tbody>
                  {topBets.map((bet, i) => {
                    const fixtureName = bet.outcomes?.[0]?.fixture?.name ?? '–';
                    const cashout = getCashoutValue(bet);
                    const open = getOpenLegsCount(bet);
                    const total = bet.outcomes?.length ?? 0;
                    const legsStyle = open <= 1
                      ? { background: 'rgba(255,51,102,0.2)', color: 'var(--app-error)', border: '1px solid rgba(255,51,102,0.5)' }
                      : open <= 3
                        ? { background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.5)' }
                        : { background: 'var(--app-bg-elevated)', color: 'var(--app-text-muted)', border: '1px solid transparent' };
                    return (
                      <tr
                        key={bet.id}
                        onClick={() => openActiveBetsModal(bet.id)}
                        className="cursor-pointer transition-colors hover:bg-[rgba(var(--app-accent-rgb),0.06)]"
                        style={{ borderBottom: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
                      >
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--app-text-muted)' }}>{i + 1}</td>
                        <td className="py-1.5 px-2 truncate max-w-[100px]" style={{ color: 'var(--app-text)' }} title={fixtureName}>
                          {fixtureName}
                        </td>
                        <td className="py-1.5 px-1 text-right font-mono text-[10px]" style={{ color: 'var(--app-accent)' }}>
                          {getEffectiveOdds(bet) > 0 ? `${getEffectiveOdds(bet).toFixed(1)}x` : '–'}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono" style={{ color: 'var(--app-accent)' }}>
                          {cashout > 0 ? formatUsdShort(cashout, bet.currency) : '–'}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={legsStyle}>
                            {open}/{total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
