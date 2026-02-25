import { BetGraph } from './BetGraph';
import { MatchTracker } from './MatchTracker';
import type { SportBet, SportBetOutcome } from '../../store/userStore';
import { getCashoutValue } from '../../services/cashoutService';
import { formatAmount } from '../Casino/utils/formatAmount';

function getLegStatus(outcome: SportBetOutcome): 'won' | 'lost' | 'open' {
  const s = (outcome?.status ?? outcome?.outcome?.status ?? '').toLowerCase();
  if (s === 'won' || s === 'win') return 'won';
  if (s === 'lost' || s === 'loss') return 'lost';
  return 'open';
}

interface BetPreviewModalProps {
  bet: SportBet;
  onClose: () => void;
  onCashout?: (betId: string, multiplier: number) => void;
}

function formatCurrency(amount: number, currency: string): string {
  const curr = (currency || '').toLowerCase();
  const isFiat = ['usd', 'eur', 'jpy', 'usdc', 'usdt', 'brl', 'cad', 'cny', 'idr', 'inr', 'krw', 'mxn', 'php', 'pln', 'rub', 'try', 'vnd'].includes(curr);
  const isZeroDecimal = ['idr', 'jpy', 'krw', 'vnd'].includes(curr);
  let val = amount;
  if (isFiat && !isZeroDecimal) val = amount * 100;
  return `${formatAmount(val, currency)} ${(currency || 'UNK').toUpperCase()}`;
}

export function BetPreviewModal({ bet, onClose, onCashout }: BetPreviewModalProps) {
  const handleCashout = () => {
    if (bet.cashoutMultiplier && onCashout) onCashout(bet.id, bet.cashoutMultiplier);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#1a2c38] border border-[#2f4553] rounded-lg shadow-2xl w-[95vw] max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#2f4553] bg-[#0f212e] shrink-0">
          <h3 className="text-lg font-bold text-white">Schein-Preview</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#2f4553] rounded-lg transition-colors text-[#b1bad3] hover:text-white">
            ✕
          </button>
        </div>

        {/* Bet summary */}
        <div className="p-4 border-b border-[#2f4553] bg-[#1a2c38] shrink-0">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <span className="text-white font-bold font-mono">{formatCurrency(bet.amount, bet.currency)}</span>
              <span className="text-[#b1bad3] text-xs ml-2 uppercase">Einsatz</span>
            </div>
            <div className="text-right">
              <span className="text-[#00e701] font-bold font-mono">
                {formatCurrency(bet.amount * (bet.potentialMultiplier || bet.payoutMultiplier || 0), bet.currency)}
              </span>
              <span className="text-[#b1bad3] text-xs ml-2 uppercase">Möglicher Gewinn</span>
            </div>
            <span
              className={`text-xs font-bold px-2 py-1 rounded uppercase border ${
                bet.status === 'active' ? 'bg-[#1475e1]/10 text-[#1475e1] border-[#1475e1]/30' :
                bet.status === 'won' ? 'bg-[#00e701]/10 text-[#00e701] border-[#00e701]/30' :
                bet.status === 'lost' ? 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/30' :
                'bg-[#2f4553] text-[#b1bad3] border-transparent'
              }`}
            >
              {bet.status}
            </span>
          </div>
          {bet.status === 'active' && getCashoutValue(bet) > 0 && (
            <div className="mt-2 text-xs text-[#b1bad3]">
              Aktueller Cashout: <span className="text-[#00e701] font-mono font-bold">{formatCurrency(getCashoutValue(bet), bet.currency)}</span>
            </div>
          )}
        </div>

        {/* Matches + outcomes (scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
          {bet.outcomes?.map((o, i) => {
            const legStatus = getLegStatus(o);
            return (
              <div key={o?.id ?? i} className={`border rounded-lg p-3 bg-[#0f212e] ${legStatus === 'won' ? 'border-[#00e701]/50' : legStatus === 'lost' ? 'border-[#ff4d4d]/50' : 'border-[#2f4553]'}`}>
                {/* Leg-Status: Gewonnen / Verloren / Offen */}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    legStatus === 'won' ? 'text-[#00e701]' : legStatus === 'lost' ? 'text-[#ff4d4d]' : 'text-[#55657e]'
                  }`}>
                    {legStatus === 'won' && (
                      <>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                        Gewonnen
                      </>
                    )}
                    {legStatus === 'lost' && (
                      <>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        Verloren
                      </>
                    )}
                    {legStatus === 'open' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#55657e] shrink-0" />
                        Offen
                      </>
                    )}
                  </span>
                  <span className="text-[#00e701] font-mono text-sm bg-[#1a2c38] px-2 py-0.5 rounded border border-[#2f4553]">
                    {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                  </span>
                </div>
                {o?.fixture?.eventStatus && <MatchTracker fixture={o.fixture} />}
                <div className="mt-2">
                  <div className="flex items-center text-sm">
                    <span className="text-white font-medium truncate flex-1" title={o?.outcome?.name}>
                      {o?.outcome?.name ?? '–'}
                    </span>
                  </div>
                  <div className="text-xs text-[#55657e] mt-1 truncate">
                    {o?.market?.name} · {o?.fixture?.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Graph + Cashout for active bets */}
        {bet.status === 'active' && !bet.cashoutDisabled && bet.cashoutMultiplier && (
          <div className="p-4 border-t border-[#2f4553] bg-[#0f212e] shrink-0">
            <div className="mb-3 h-16 w-full bg-[#1a2c38] rounded overflow-hidden border border-[#2f4553]">
              <BetGraph
                currentValue={bet.cashoutMultiplier}
                maxValue={bet.potentialMultiplier}
                label=""
                color={bet.cashoutMultiplier > 1 ? '#00e701' : '#ffd700'}
                height={64}
              />
            </div>
            {onCashout && (
              <button
                onClick={handleCashout}
                className="w-full bg-[#00e701] hover:bg-[#00c201] text-[#0f212e] font-bold text-sm py-2.5 rounded border border-[#00e701] shadow-lg transition-all"
              >
                Cashout {formatCurrency(bet.amount * bet.cashoutMultiplier, bet.currency)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
