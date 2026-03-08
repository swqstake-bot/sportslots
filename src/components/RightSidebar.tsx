import { useUiStore } from '../store/uiStore';
import { AutoBetView } from './AutoBet/AutoBetView';
import { ActiveBetsList, ActiveBetsModal } from './ActiveBets';
import { BetSlip } from './BetSlip';
import { useBetSlipStore } from '../store/betSlipStore';

export function RightSidebar() {
  const { rightSidebarTab, setRightSidebarTab, isBetSlipExpanded, toggleBetSlip, isActiveBetsModalOpen, toggleActiveBetsModal } = useUiStore();
  const { outcomes } = useBetSlipStore();

  return (
    <div 
      className="flex flex-col border-l h-full w-[360px] overflow-hidden shadow-2xl z-40 relative"
      style={{ 
        background: 'var(--app-bg-deep)', 
        borderColor: 'var(--app-border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.35), 0 0 1px var(--app-border)'
      }}
    >
      {isActiveBetsModalOpen && <ActiveBetsModal onClose={toggleActiveBetsModal} />}

      <div 
        className="flex border-b p-1"
        style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)' }}
      >
        {(['activebets', 'autobet'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightSidebarTab(tab)}
            className="flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider"
            style={rightSidebarTab === tab
              ? { color: 'var(--app-text)', background: 'var(--app-bg-card)', borderBottom: '2px solid var(--app-accent)' }
              : { color: 'var(--app-text-muted)' }
            }
          >
            {tab === 'activebets' ? 'Active Bets' : 'AutoBet'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--app-bg-deep)' }}>
        {rightSidebarTab === 'activebets' && (
          <div className="h-full overflow-hidden">
            <ActiveBetsList />
          </div>
        )}
        {rightSidebarTab === 'autobet' && (
          <div className="h-full overflow-hidden">
            <AutoBetView />
          </div>
        )}
      </div>

      <div 
        className={`flex flex-col transition-all duration-300 ease-in-out border-t ${isBetSlipExpanded ? 'h-[60%]' : 'h-20'}`}
        style={{ 
          background: 'var(--app-bg-deep)', 
          borderColor: 'var(--app-border)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.4)'
        }}
      >
        <button 
          onClick={toggleBetSlip}
          className="w-full flex justify-between items-center p-5 transition-colors border-b group"
          style={{ 
            background: 'var(--app-bg-deep)', 
            borderColor: 'var(--app-border)'
          }}
        >
          <div className="flex items-center gap-3">
            <span 
              className="font-bold text-lg uppercase tracking-wide transition-colors"
              style={{ color: 'var(--app-text)' }}
            >
              Bet Slip
            </span>
            {outcomes.length > 0 && (
              <span 
                className="font-bold text-sm px-2.5 py-0.5 rounded-full"
                style={{ background: 'var(--app-accent)', color: 'var(--app-bg-deep)', boxShadow: '0 0 12px var(--app-accent-glow)' }}
              >
                {outcomes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3" style={{ color: 'var(--app-text-muted)' }}>
            <span className="text-sm font-bold uppercase tracking-wider">{isBetSlipExpanded ? 'Einklappen' : 'Aufklappen'}</span>
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${isBetSlipExpanded ? 'rotate-180' : ''}`} 
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </button>
        
        <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--app-bg-card)' }}>
          <BetSlip />
        </div>
      </div>
    </div>
  );
}
