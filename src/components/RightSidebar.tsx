import { useUiStore } from '../store/uiStore';
import { AutoBetView } from './AutoBet/AutoBetView';
import { ActiveBetsList, ActiveBetsModal } from './ActiveBets';
import { BetSlip } from './BetSlip';
import { useBetSlipStore } from '../store/betSlipStore';

export function RightSidebar() {
  const { rightSidebarTab, setRightSidebarTab, isBetSlipExpanded, toggleBetSlip, isActiveBetsModalOpen, toggleActiveBetsModal } = useUiStore();
  const { outcomes } = useBetSlipStore();

  return (
    <aside className="sports-right-rail">
      {isActiveBetsModalOpen && <ActiveBetsModal onClose={toggleActiveBetsModal} />}

      <div className="sports-right-rail-tabs">
        {(['activebets', 'autobet'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightSidebarTab(tab)}
            className={`sports-right-rail-tab-btn ${rightSidebarTab === tab ? 'is-active' : ''}`.trim()}
          >
            {tab === 'activebets' ? 'Active Bets' : 'AutoBet'}
          </button>
        ))}
      </div>

      <div className="sports-right-rail-content">
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

      <div className={`sports-betslip-wrap ${isBetSlipExpanded ? 'is-expanded' : 'is-collapsed'}`.trim()}>
        <button 
          onClick={toggleBetSlip}
          className="sports-betslip-toggle"
        >
          <div className="flex items-center gap-3">
            <span className="sports-betslip-title">
              Bet Slip
            </span>
            {outcomes.length > 0 && (
              <span className="sports-betslip-count">
                {outcomes.length}
              </span>
            )}
          </div>
          <div className="sports-betslip-toggle-right">
            <span className="text-sm font-bold uppercase tracking-wider">{isBetSlipExpanded ? 'Collapse' : 'Expand'}</span>
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${isBetSlipExpanded ? 'rotate-180' : ''}`} 
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </button>
        
        <div className="sports-betslip-body">
          <BetSlip />
        </div>
      </div>
    </aside>
  );
}
