import React, { useMemo } from 'react';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount, getClosedLegsCount } from '../../services/cashoutService';

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
        // Sekundär: mehr erledigte Legs = besser (11/12 vor 11/11)
        return getClosedLegsCount(b) - getClosedLegsCount(a);
      })
      .slice(0, TOP_N);
  }, [activeBets]);

  if (!activeBets) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--app-bg-deep)' }}>
      <div className="p-2 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)' }}>
        <button
          onClick={toggleActiveBetsModal}
          className="w-full rounded-lg py-2 px-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 border hover:border-[var(--app-accent)] hover:bg-[rgba(var(--app-accent-rgb),0.08)] hover:text-[var(--app-text)]"
          style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Alle Wetten ({activeBets.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {activeBets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--app-text-muted)', opacity: 0.8 }}>
            <svg className="w-10 h-10 mb-2" style={{ color: 'var(--app-border)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">Keine aktiven Wetten</span>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider px-1 mb-1.5" style={{ color: 'var(--app-text-muted)' }}>Top 15 (Cashout → Legs)</p>
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)' }}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b" style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                    <th className="py-1.5 px-2 font-bold w-6">#</th>
                    <th className="py-1.5 px-2 font-bold truncate max-w-[100px]">Fixture</th>
                    <th className="py-1.5 px-1 font-bold text-right w-10">Quote</th>
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
                        onClick={toggleActiveBetsModal}
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
                          {cashout > 0 ? formatShort(cashout, bet.currency) : '–'}
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
