import { useState, useRef, useEffect } from 'react';
import { useUserStore, type UserBalance } from '../store/userStore';
import { getMinorFactor, normalizeCurrencyCode, convertToUsd } from '../utils/monetaryContract';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { fetchCurrencyRates } from './Casino/api/stakeChallenges';

/** Polling nur für die Header-Balance (GraphQL liefert kein Push für Wallet). */
const BALANCE_POLL_MS = 1000;

export function WalletSelector() {
  const user = useUserStore((s) => s.user);
  const balances = useUserStore((s) => s.balances);
  const selectedCurrency = useUserStore((s) => s.selectedCurrency);
  const setSelectedCurrency = useUserStore((s) => s.setSelectedCurrency);
  const setBalancesFromApi = useUserStore((s) => s.setBalancesFromApi);

  const [isOpen, setIsOpen] = useState(false);
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadRates = async () => {
      try {
        const map = await fetchCurrencyRates('');
        if (!cancelled && map && typeof map === 'object') setUsdRates(map);
      } catch {
        /* Kurse optional */
      }
    };
    void loadRates();
    const ratesId = window.setInterval(() => void loadRates(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(ratesId);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const pullBalances = async () => {
      try {
        const res = await StakeApi.query<{ user?: { balances?: UserBalance[] } }>(Queries.FetchBalances);
        const list = res.data?.user?.balances;
        if (!cancelled && Array.isArray(list)) {
          setBalancesFromApi(list);
        }
      } catch {
        /* Session / Netz — letzten Stand behalten */
      }
    };

    void pullBalances();
    const id = window.setInterval(() => void pullBalances(), BALANCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, setBalancesFromApi]);

  const formatBalance = (amount: number, currency: string) => {
    const curr = normalizeCurrencyCode(currency);
    const factor = getMinorFactor(curr);
    const digits = factor === 1 ? 0 : (factor === 100 ? 2 : 8);
    return Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const currentBalance = balances[selectedCurrency] || 0;
  // Stake `UserBalances.available.amount` = Hauptbetrag je Währung (z. B. 259.13 USDC), nicht „Minor/Cents“.
  const usdConv = convertToUsd(currentBalance, selectedCurrency, 'major', usdRates);
  const usdLine =
    usdConv.usdAmount != null && Number.isFinite(usdConv.usdAmount)
      ? `≈ $${usdConv.usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
      : 'USD: —';

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="flex items-center justify-between rounded-lg py-1.5 px-3 min-w-[200px] transition-all group min-h-10 gap-3 hover:bg-white/5"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0, 240, 255, 0.25)' }}
      >
        <div className="flex flex-col items-start leading-tight gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider transition-colors" style={{ color: 'var(--app-text-muted)' }}>
            Balance · live
          </span>
          <span className="font-mono font-bold text-sm tracking-tight transition-colors group-hover:opacity-90" style={{ color: 'var(--app-accent)' }}>
            {usdLine}
          </span>
          <span className="font-mono text-[10px] tracking-tight transition-colors" style={{ color: 'var(--app-text-muted)' }}>
            {formatBalance(currentBalance, selectedCurrency)} {selectedCurrency.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-3 border-l h-full" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 50%, transparent)' }}>
           <span className="uppercase font-bold text-xs tracking-wider" style={{ color: 'var(--app-accent)' }}>
            {selectedCurrency}
          </span>
          <svg 
            className={`w-2.5 h-2.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            style={{ color: 'var(--app-text-muted)' }}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50" style={{ background: 'rgba(15, 15, 25, 0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0, 240, 255, 0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(0, 240, 255, 0.08)' }}>
          <div className="p-3 border-b flex justify-between items-center" style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)' }}>
             <h3 className="text-xs font-bold text-white uppercase tracking-wider">Wallet</h3>
             <button className="text-[10px] font-bold hover:underline" style={{ color: 'var(--app-accent)' }}>Manage</button>
          </div>
          
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin p-1 space-y-0.5" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
            {Object.keys(balances).length > 0 ? (
               Object.entries(balances).map(([currency, amount]) => (
                <button
                  key={currency}
                  onClick={() => handleSelect(currency)}
                  className={`w-full text-left px-3 py-2.5 rounded-[4px] flex justify-between items-center group transition-colors border ${
                    selectedCurrency === currency ? 'shadow-inner'                     : 'border-transparent hover:bg-[var(--app-bg-deep)] hover:border-[var(--app-border)]'
                  }`}
                  style={selectedCurrency === currency 
                    ? { background: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' } 
                    : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                      <div 
                        className="w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]"
                        style={{ background: selectedCurrency === currency ? 'var(--app-accent)' : 'var(--app-text-muted)', color: selectedCurrency === currency ? 'var(--app-accent)' : 'var(--app-text-muted)' }}
                      ></div>
                      <span 
                        className={`uppercase font-bold text-xs ${selectedCurrency === currency ? 'text-white' : 'group-hover:text-white'}`}
                        style={selectedCurrency !== currency ? { color: 'var(--app-text-muted)' } : undefined}
                      >
                          {currency}
                      </span>
                  </div>
                  <span 
                    className={`font-mono text-xs font-bold ${selectedCurrency === currency ? '' : 'group-hover:text-white'}`}
                    style={{ color: selectedCurrency === currency ? 'var(--app-accent)' : 'var(--app-text-muted)' }}
                  >
                      {formatBalance(amount, currency)}
                  </span>
                </button>
              ))
            ) : (
               <div className="p-4 text-center text-xs italic" style={{ color: 'var(--app-text-muted)' }}>No balances found</div>
            )}
          </div>
           <div className="p-2 grid grid-cols-2 gap-2" style={{ background: 'var(--app-bg-deep)', borderTop: '1px solid var(--app-border)' }}>
              <button className="py-2.5 bg-[#1475e1] hover:bg-[#1464c0] text-white font-bold text-[10px] rounded-[4px] transition-colors shadow-lg uppercase tracking-wider">
                  Deposit
              </button>
              <button className="py-2.5 text-white font-bold text-[10px] rounded-[4px] transition-colors shadow-lg uppercase tracking-wider" style={{ background: 'var(--app-border)' }}>
                  Withdraw
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
