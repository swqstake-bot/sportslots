import React, { useMemo } from 'react';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount } from '../../services/cashoutService';

const TOP_N = 15;

function formatShort(amount: number, currency: string): string {
  const c = (currency || '').toUpperCase();
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k ${c}`;
  if (amount >= 1) return `${amount.toFixed(2)} ${c}`;
  return `${amount.toFixed(4)} ${c}`;
}

export const ActiveBetsList: React.FC = () => {
  const { activeBets } = useUserStore();
  const { toggleActiveBetsModal } = useUiStore();

  const topBets = useMemo(() => {
    if (!activeBets?.length) return [];
    return [...activeBets]
      .sort((a, b) => {
        const cashA = getCashoutValue(a);
        const cashB = getCashoutValue(b);
        if (cashB !== cashA) return cashB - cashA;
        return getOpenLegsCount(a) - getOpenLegsCount(b);
      })
      .slice(0, TOP_N);
  }, [activeBets]);

  if (!activeBets) return null;

  return (
    <div className="flex flex-col h-full bg-stake-bg-deep overflow-hidden">
      <div className="p-2 border-b border-stake-border bg-stake-bg-card">
        <button
          onClick={toggleActiveBetsModal}
          className="w-full bg-stake-bg-deep hover:bg-stake-border text-stake-text-muted hover:text-white border border-stake-border rounded py-2 px-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Alle Wetten ({activeBets.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {activeBets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-stake-text-muted opacity-70">
            <svg className="w-12 h-12 mb-3 text-stake-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">Keine aktiven Wetten</span>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-bold text-stake-text-dim uppercase tracking-wider px-1 mb-1.5">Top 15 (Cashout → Legs offen)</p>
            <div className="rounded-lg border border-stake-border bg-stake-bg-card overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stake-bg-deep/80 text-stake-text-muted border-b border-stake-border">
                    <th className="py-1.5 px-2 font-bold w-6">#</th>
                    <th className="py-1.5 px-2 font-bold truncate max-w-[100px]">Fixture</th>
                    <th className="py-1.5 px-1 font-bold text-right w-10">Quote</th>
                    <th className="py-1.5 px-2 font-bold text-right w-12">Cashout</th>
                    <th className="py-1.5 px-2 font-bold text-center w-10">Legs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stake-border/70">
                  {topBets.map((bet, i) => {
                    const fixtureName = bet.outcomes?.[0]?.fixture?.name ?? '–';
                    const cashout = getCashoutValue(bet);
                    const open = getOpenLegsCount(bet);
                    const total = bet.outcomes?.length ?? 0;
                    const legsClass =
                      open <= 1
                        ? 'bg-red-500/20 text-red-400 border-red-500/50'
                        : open <= 3
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                          : 'bg-stake-border/50 text-stake-text-muted border-transparent';
                    return (
                      <tr
                        key={bet.id}
                        onClick={toggleActiveBetsModal}
                        className="hover:bg-stake-border/50 cursor-pointer transition-colors text-stake-text-muted hover:text-white"
                      >
                        <td className="py-1.5 px-2 font-mono text-stake-text-dim">{i + 1}</td>
                        <td className="py-1.5 px-2 truncate max-w-[100px]" title={fixtureName}>
                          {fixtureName}
                        </td>
                        <td className="py-1.5 px-1 text-right font-mono text-stake-success text-[10px]">
                          {getEffectiveOdds(bet) > 0
                            ? `${getEffectiveOdds(bet).toFixed(1)}x`
                            : '–'}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-stake-success">
                          {cashout > 0 ? formatShort(cashout, bet.currency) : '–'}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${legsClass}`}>
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
