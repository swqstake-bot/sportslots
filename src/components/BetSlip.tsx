import { useState } from 'react';
import { useBetSlipStore } from '../store/betSlipStore';
import { useUserStore } from '../store/userStore';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';

export function BetSlip() {
  const { outcomes, removeOutcome, clearSlip } = useBetSlipStore();
  const { addActiveBet, selectedCurrency } = useUserStore();
  const [amount, setAmount] = useState<string>('');
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const totalOdds = outcomes.reduce((acc, o) => acc * o.odds, 1);
  const potentialPayout = parseFloat(amount || '0') * totalOdds;

  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handlePlaceBet = async () => {
    if (outcomes.length === 0) return;
    
    setPlacing(true);
    setResult(null);

    try {
      // Generate a random identifier
      const identifier = generateUUID();

      const variables = {
        amount: parseFloat(amount || '0'),
        currency: selectedCurrency,
        outcomeIds: outcomes.map(o => o.id),
        betType: 'sports',
        oddsChange: 'any', // Accept any odds change for smoother UX
        identifier: identifier
      };

      const response = await StakeApi.query(Queries.PlaceSportBet, variables);

      if (response.data?.sportBet) {
        setResult({ success: true, message: 'Bet placed successfully!' });
        addActiveBet(response.data.sportBet);
        setTimeout(() => {
          clearSlip();
          setResult(null);
          setAmount('');
        }, 3000);
      } else if (response.errors) {
        throw new Error(response.errors[0].message);
      }
    } catch (err: any) {
      console.error('Bet placement failed:', err);
      setResult({ success: false, message: err.message || 'Failed to place bet' });
    } finally {
      setPlacing(false);
    }
  };

  if (outcomes.length === 0) {
    return (
      <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center" style={{ background: 'var(--app-bg-card)' }}>
        <div className="p-4 rounded-full mb-4" style={{ background: 'var(--app-border)' }}>
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--app-text-muted)' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
        </div>
        <span className="font-bold text-sm uppercase tracking-wider mb-2" style={{ color: 'var(--app-text)' }}>Bet Slip Empty</span>
        <span className="text-xs leading-relaxed max-w-[200px]" style={{ color: 'var(--app-text-muted)' }}>Select outcomes from any event to add them to your bet slip.</span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full" style={{ background: 'var(--app-bg-card)' }}>
      <div className="px-4 py-3 border-b flex justify-between items-center z-10" style={{ background: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--app-accent)', boxShadow: '0 0 5px var(--app-accent-glow)' }}></div>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>Single Bet</span>
        </div>
        <button 
          onClick={clearSlip} 
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded hover:opacity-90 transition-opacity"
          style={{ color: 'var(--app-text-muted)' }}
        >
          Clear All
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
        {outcomes.map((outcome, index) => (
          <div key={`${outcome.id}-${index}`} className="rounded p-3 relative group border transition-all hover:opacity-95" style={{ background: 'var(--app-bg-deep)', borderColor: 'transparent' }}>
            <button 
              onClick={() => removeOutcome(outcome.id)}
              className="absolute top-2 right-2 p-1 transition-colors"
              style={{ color: 'var(--app-text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--app-error)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--app-text-muted)'; }}
            >
              <svg className="w-3.5 h-3.5 hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <div className="pr-6 mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5 line-clamp-1" style={{ color: 'var(--app-accent)' }}>
                    {outcome.fixtureName}
                </div>
                <div className="font-bold text-xs leading-tight" style={{ color: 'var(--app-text)' }}>{outcome.name}</div>
                <div className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{outcome.marketName}</div>
            </div>
            
            <div className="flex justify-end">
               <div className="px-2 py-1 rounded font-mono font-bold text-xs" style={{ background: 'var(--app-border)', color: 'var(--app-accent)' }}>
                 {outcome.odds.toFixed(2)}
               </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t space-y-3 z-20" style={{ background: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', boxShadow: '0 -4px 10px rgba(0,0,0,0.2)' }}>
        {outcomes.length > 1 && (
          <div className="flex justify-between items-center text-xs pb-2 border-b" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 50%, transparent)' }}>
            <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Total Odds</span>
            <span className="font-bold font-mono" style={{ color: 'var(--app-accent)' }}>{totalOdds.toFixed(2)}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
             <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Stake Amount</label>
             <div className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ color: 'var(--app-text)', background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)' }}>
                {selectedCurrency.toUpperCase()}
             </div>
          </div>
          
          <div className="relative group">
             <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded pl-3 pr-16 py-2.5 transition-all font-mono text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
              style={{ background: 'var(--app-bg-deep)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
            />
             <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none font-bold text-xs" style={{ color: 'var(--app-text-muted)' }}>
                 {selectedCurrency.toUpperCase()}
             </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Est. Payout</span>
          <span className="font-bold font-mono text-sm tracking-tight" style={{ color: 'var(--app-accent)' }}>
            {potentialPayout.toFixed(2)} <span className="text-[10px] ml-1" style={{ color: 'var(--app-text-muted)' }}>{selectedCurrency.toUpperCase()}</span>
          </span>
        </div>

        {result && (
          <div className={`text-[10px] p-2.5 rounded border font-bold flex items-center gap-2 ${result.success ? '' : ''}`} style={result.success ? { background: 'rgba(var(--app-accent-rgb), 0.12)', borderColor: 'var(--app-accent)', color: 'var(--app-accent)' } : { background: 'rgba(255,51,102,0.12)', borderColor: 'var(--app-error)', color: 'var(--app-error)' }}>
            {result.success ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            )}
            {result.message}
          </div>
        )}

        <button
          onClick={handlePlaceBet}
          disabled={placing || outcomes.length === 0}
          className="w-full font-bold py-3 rounded text-sm transition-all shadow-lg uppercase tracking-wider transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          style={placing || outcomes.length === 0
            ? { background: 'var(--app-border)', color: 'var(--app-text-muted)' }
            : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)', boxShadow: '0 0 15px var(--app-accent-glow)' }
          }
        >
          {placing ? 'Placing Bet...' : 'Place Bet'}
        </button>
      </div>
    </div>
  );
}
