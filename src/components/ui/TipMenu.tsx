import { useState, useRef, useEffect } from 'react';

type TipWallet = {
  id: string;
  label: string;
  address: string;
  icon: string;
  /** Stake `currency` query param (crypto code). */
  currency: string;
  /** Optional Stake `chain` query param (e.g. usdc on eth / bsc / sol). */
  chain?: string;
};

const TIP_WALLETS: TipWallet[] = [
  {
    id: 'sol',
    label: 'USDC (Solana)',
    address: 'FYN6Ejv7qLG4q6PrFW2txSLdV5i7dekGtibTMTZjRrWC',
    icon: '◎',
    currency: 'usdc',
    chain: 'sol',
  },
  { id: 'xrp', label: 'XRP (No Memo)', address: 'rNq4YuCm3sQNd7r5GVxA5m5p4H7eS3jjsq', icon: '✕', currency: 'xrp' },
  { id: 'btc', label: 'Bitcoin', address: 'bc1qvee0n46u7r3p0cawlc860apd0yshsx76dcznqy', icon: '₿', currency: 'btc', chain: 'btc' },
  { id: 'ltc', label: 'LTC', address: 'LQP2hMfrz9CQEwbQt89qgnYcCdqYwzAm9o', icon: 'Ł', currency: 'ltc', chain: 'ltc' },
];

export function TipMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setStatus(null);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStakeWithdraw = async (wallet: TipWallet) => {
    setStatus(null);
    try {
      const api = window.electronAPI;
      if (!api?.openStakeWithdrawPrefill) {
        handleCopy(wallet.address);
        setStatus('Nur kopiert (Electron-API fehlt).');
        return;
      }
      const res = await api.openStakeWithdrawPrefill({
        address: wallet.address,
        currency: wallet.currency,
        chain: wallet.chain,
        locale: 'de',
      });
      if (!res?.ok) {
        if (res?.error === 'session_invalid') {
          setStatus('Keine gültige Stake-Session — bitte in der App einloggen (Session), dann erneut.');
        } else {
          setStatus(`Konnte Stake nicht öffnen (${String(res?.error || 'unknown')}).`);
        }
        return;
      }
      setStatus(res.filled ? 'Stake geöffnet — Adresse eingefügt.' : 'Stake geöffnet — Adresse bitte prüfen (Feld nicht gefunden).');
      setTimeout(() => setStatus(null), 6000);
    } catch (e) {
      setStatus(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-transparent border border-[#ffd700] text-[#ffd700] rounded hover:bg-[#ffd700]/10 transition-colors text-sm font-medium"
        title="Tip / Auszahlung"
      >
        <span>Maxwin Hit? -&gt; Send Tip 💸</span>
        <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 min-w-[280px] bg-[#1a2c38] border border-[#2f4553] rounded-lg shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 text-xs font-bold text-[#b1bad3] uppercase tracking-wider mb-1">
            Stake Auszahlung
          </div>
          <p className="px-2 pb-2 text-[0.7rem] text-[#8a9aad] leading-snug">
            Öffnet Wallet → Auszahlung mit passender Währung/Chain und trägt die Adresse ein. Rechts: nur kopieren.
          </p>

          <div className="space-y-1">
            {TIP_WALLETS.map((wallet) => (
              <div key={wallet.id} className="flex items-stretch gap-1 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => void handleOpenStakeWithdraw(wallet)}
                  className="flex-1 flex items-center gap-2 px-2 py-2 text-sm text-white hover:bg-[#2f4553] transition-colors text-left min-w-0"
                >
                  <span className="w-5 shrink-0 text-center text-[#b1bad3]">{wallet.icon}</span>
                  <span className="truncate">{wallet.label}</span>
                </button>
                <button
                  type="button"
                  title="Nur Adresse kopieren"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(wallet.address);
                    setIsOpen(false);
                  }}
                  className="shrink-0 px-2 text-xs text-[#b1bad3] hover:bg-[#2f4553] hover:text-white border-l border-[#2f4553]"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>

          {copied && (
            <div className="mt-2 p-2 bg-[#00e701]/10 text-[#00e701] text-xs text-center rounded border border-[#00e701]/20 font-medium animate-in fade-in slide-in-from-top-1">
              Adresse kopiert
            </div>
          )}
          {status && (
            <div className="mt-2 p-2 bg-[#2f4553]/50 text-[#b1bad3] text-xs text-center rounded border border-[#2f4553]">
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
