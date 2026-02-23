import React, { useState, useRef, useEffect } from 'react';

const TIP_WALLETS = [
  { id: 'sol', label: 'USDC (Solana)', address: 'FYN6Ejv7qLG4q6PrFW2txSLdV5i7dekGtibTMTZjRrWC', icon: '◎' },
  { id: 'xrp', label: 'XRP (No Memo)', address: 'rNq4YuCm3sQNd7r5GVxA5m5p4H7eS3jjsq', icon: '✕' },
  { id: 'btc', label: 'Bitcoin', address: 'bc1qvee0n46u7r3p0cawlc860apd0yshsx76dcznqy', icon: '₿' },
  { id: 'ltc', label: 'LTC', address: 'LQP2hMfrz9CQEwbQt89qgnYcCdqYwzAm9o', icon: 'Ł' },
];

export function TipMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-transparent border border-[#ffd700] text-[#ffd700] rounded hover:bg-[#ffd700]/10 transition-colors text-sm font-medium"
        title="Show Tip Options"
      >
        <span>Maxwin Hit? -&gt; Send Tip 💸</span>
        <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 min-w-[220px] bg-[#1a2c38] border border-[#2f4553] rounded-lg shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 text-xs font-bold text-[#b1bad3] uppercase tracking-wider mb-1">
            Select Wallet to Copy:
          </div>
          
          <div className="space-y-1">
            {TIP_WALLETS.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => handleCopy(wallet.address)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white hover:bg-[#2f4553] rounded transition-colors text-left group"
              >
                <span className="w-5 text-center text-[#b1bad3] group-hover:text-white transition-colors">{wallet.icon}</span>
                <span>{wallet.label}</span>
              </button>
            ))}
          </div>

          {copied && (
            <div className="mt-2 p-2 bg-[#00e701]/10 text-[#00e701] text-xs text-center rounded border border-[#00e701]/20 font-medium animate-in fade-in slide-in-from-top-1">
              Address Copied!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
