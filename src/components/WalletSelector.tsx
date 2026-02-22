import { useState, useRef, useEffect } from 'react';
import { useUserStore } from '../store/userStore';

export function WalletSelector() {
  const { balances, selectedCurrency, setSelectedCurrency } = useUserStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleSelect = (currency: string) => {
    setSelectedCurrency(currency);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

  const formatBalance = (amount: number, currency: string) => {
    if (['usd', 'eur', 'jpy', 'brl', 'inr'].includes(currency.toLowerCase())) {
      return amount.toFixed(2);
    }
    return amount.toFixed(8);
  };

  const currentBalance = balances[selectedCurrency] || 0;

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="flex items-center justify-between bg-[#0f212e] hover:bg-[#1a2c38] border border-[#2f4553] rounded-[4px] py-1.5 px-3 min-w-[160px] transition-all shadow-sm group h-10 gap-3"
      >
        <div className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-bold text-[#b1bad3] uppercase tracking-wider group-hover:text-white transition-colors">Balance</span>
          <span className="font-mono font-bold text-white group-hover:text-[#00e701] transition-colors text-sm tracking-tight">
            {formatBalance(currentBalance, selectedCurrency)}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-3 border-l border-[#2f4553]/50 h-full">
           <span className="uppercase text-[#00e701] font-bold text-xs tracking-wider">
            {selectedCurrency}
          </span>
          <svg 
            className={`w-2.5 h-2.5 text-[#b1bad3] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#1a2c38] border border-[#2f4553] rounded-[4px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div className="p-3 bg-[#0f212e] border-b border-[#2f4553] flex justify-between items-center">
             <h3 className="text-xs font-bold text-white uppercase tracking-wider">Wallet</h3>
             <button className="text-[10px] text-[#00e701] font-bold hover:underline">Manage</button>
          </div>
          
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent p-1 space-y-0.5">
            {Object.keys(balances).length > 0 ? (
               Object.entries(balances).map(([currency, amount]) => (
                <button
                  key={currency}
                  onClick={() => handleSelect(currency)}
                  className={`w-full text-left px-3 py-2.5 rounded-[4px] flex justify-between items-center group transition-colors border border-transparent ${
                    selectedCurrency === currency 
                    ? 'bg-[#2f4553] border-[#2f4553] shadow-inner' 
                    : 'hover:bg-[#0f212e] hover:border-[#2f4553]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shadow-[0_0_5px_currentColor] ${selectedCurrency === currency ? 'bg-[#00e701] text-[#00e701]' : 'bg-[#b1bad3] text-[#b1bad3]'}`}></div>
                      <span className={`uppercase font-bold text-xs ${selectedCurrency === currency ? 'text-white' : 'text-[#b1bad3] group-hover:text-white'}`}>
                          {currency}
                      </span>
                  </div>
                  <span className={`font-mono text-xs font-bold ${selectedCurrency === currency ? 'text-[#00e701]' : 'text-[#b1bad3] group-hover:text-white'}`}>
                      {formatBalance(amount, currency)}
                  </span>
                </button>
              ))
            ) : (
               <div className="p-4 text-center text-[#b1bad3] text-xs italic">No balances found</div>
            )}
          </div>
           <div className="p-2 bg-[#0f212e] border-t border-[#2f4553] grid grid-cols-2 gap-2">
              <button className="py-2.5 bg-[#1475e1] hover:bg-[#1464c0] text-white font-bold text-[10px] rounded-[4px] transition-colors shadow-lg uppercase tracking-wider">
                  Deposit
              </button>
              <button className="py-2.5 bg-[#2f4553] hover:bg-[#3d5566] text-white font-bold text-[10px] rounded-[4px] transition-colors shadow-lg uppercase tracking-wider">
                  Withdraw
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
