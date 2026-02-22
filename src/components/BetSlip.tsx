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
      <div className="w-full h-full bg-[#1a2c38] p-6 flex flex-col items-center justify-center text-center">
        <div className="bg-[#2f4553] p-4 rounded-full mb-4 shadow-lg">
           <svg className="w-6 h-6 text-[#b1bad3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
        </div>
        <span className="font-bold text-white text-sm uppercase tracking-wider mb-2">Bet Slip Empty</span>
        <span className="text-xs text-[#b1bad3] leading-relaxed max-w-[200px]">Select outcomes from any event to add them to your bet slip.</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#1a2c38] flex flex-col h-full">
      <div className="px-4 py-3 bg-[#1a2c38] border-b border-[#2f4553] flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
            <div className="bg-[#00e701] w-2 h-2 rounded-full shadow-[0_0_5px_#00e701]"></div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Single Bet</span>
        </div>
        <button 
          onClick={clearSlip} 
          className="text-[10px] font-bold text-[#b1bad3] hover:text-white transition-colors uppercase tracking-wider hover:bg-[#2f4553] px-2 py-1 rounded"
        >
          Clear All
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
        {outcomes.map((outcome, index) => (
          <div key={`${outcome.id}-${index}`} className="bg-[#0f212e] rounded p-3 relative group border border-transparent hover:border-[#2f4553] transition-all">
            <button 
              onClick={() => removeOutcome(outcome.id)}
              className="absolute top-2 right-2 text-[#55657e] hover:text-[#ff4d4d] transition-colors p-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <div className="pr-6 mb-2">
                <div className="text-[10px] text-[#00e701] font-bold uppercase tracking-wider mb-0.5 line-clamp-1">
                    {outcome.fixtureName}
                </div>
                <div className="font-bold text-xs text-white leading-tight">{outcome.name}</div>
                <div className="text-[10px] text-[#b1bad3] font-medium mt-0.5">{outcome.marketName}</div>
            </div>
            
            <div className="flex justify-end">
               <div className="bg-[#2f4553] px-2 py-1 rounded text-[#00e701] font-mono font-bold text-xs shadow-inner">
                 {outcome.odds.toFixed(2)}
               </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-[#213743] border-t border-[#2f4553] space-y-3 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] z-20">
        {outcomes.length > 1 && (
          <div className="flex justify-between items-center text-xs pb-2 border-b border-[#2f4553]/50">
            <span className="text-[#b1bad3] font-bold uppercase tracking-wider">Total Odds</span>
            <span className="font-bold text-[#00e701] font-mono">{totalOdds.toFixed(2)}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
             <label className="text-[10px] text-[#b1bad3] font-bold uppercase tracking-wider">Stake Amount</label>
             <div className="text-[10px] font-bold text-white bg-[#0f212e] px-1.5 py-0.5 rounded border border-[#2f4553]">
                {selectedCurrency.toUpperCase()}
             </div>
          </div>
          
          <div className="relative group">
             <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#0f212e] border border-[#2f4553] rounded-[4px] pl-3 pr-16 py-2.5 text-white placeholder-[#55657e] focus:outline-none focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] transition-all font-mono text-sm font-bold appearance-none"
            />
             <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#55657e] font-bold text-xs">
                 {selectedCurrency.toUpperCase()}
             </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-1">
          <span className="text-[#b1bad3] text-[10px] font-bold uppercase tracking-wider">Est. Payout</span>
          <span className="font-bold text-[#00e701] font-mono text-sm tracking-tight">
            {potentialPayout.toFixed(2)} <span className="text-[10px] text-[#55657e] ml-1">{selectedCurrency.toUpperCase()}</span>
          </span>
        </div>

        {result && (
          <div className={`text-[10px] p-2.5 rounded-[4px] border font-bold flex items-center gap-2 ${result.success ? 'bg-[#1a2f1a] border-[#00e701] text-[#00e701]' : 'bg-[#2f1a1a] border-[#ff4d4d] text-[#ff4d4d]'}`}>
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
          className={`w-full font-bold py-3 rounded-[4px] text-sm transition-all shadow-lg uppercase tracking-wider transform active:scale-[0.98] ${
            placing || outcomes.length === 0
              ? 'bg-[#2f4553] cursor-not-allowed text-[#b1bad3] opacity-50' 
              : 'bg-[#00e701] hover:bg-[#00c201] text-[#0f212e] hover:shadow-[0_0_15px_rgba(0,231,1,0.4)]'
          }`}
        >
          {placing ? 'Placing Bet...' : 'Place Bet'}
        </button>
      </div>
    </div>
  );
}
