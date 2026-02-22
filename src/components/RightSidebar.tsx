import { useUiStore } from '../store/uiStore';
import { AutoBetView } from './AutoBet/AutoBetView';
import { ActiveBetsList, ActiveBetsModal } from './ActiveBets';
import { BetSlip } from './BetSlip';
import { useBetSlipStore } from '../store/betSlipStore';

export function RightSidebar() {
  const { rightSidebarTab, setRightSidebarTab, isBetSlipExpanded, toggleBetSlip, isActiveBetsModalOpen, toggleActiveBetsModal } = useUiStore();
  const { outcomes } = useBetSlipStore();

  return (
    <div className="flex flex-col border-l border-[#2f4553] h-full w-[360px] bg-[#0f212e] overflow-hidden shadow-2xl z-40 relative">
      {/* Active Bets Modal */}
      {isActiveBetsModalOpen && <ActiveBetsModal onClose={toggleActiveBetsModal} />}

      {/* Top Tabs */}
      <div className="flex border-b border-[#2f4553] bg-[#0f212e]">
        <button
          onClick={() => setRightSidebarTab('activebets')}
          className={`flex-1 py-4 font-bold text-sm transition-all relative uppercase tracking-wider ${
            rightSidebarTab === 'activebets' 
              ? 'text-white bg-[#0f212e]' 
              : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
          }`}
        >
          Active Bets
          {rightSidebarTab === 'activebets' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
          )}
        </button>
        <button
          onClick={() => setRightSidebarTab('autobet')}
          className={`flex-1 py-4 font-bold text-sm transition-all relative uppercase tracking-wider ${
            rightSidebarTab === 'autobet' 
              ? 'text-white bg-[#0f212e]' 
              : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
          }`}
        >
          AutoBet
          {rightSidebarTab === 'autobet' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative bg-[#0f212e]">
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

      {/* Bet Slip (Bottom) */}
      <div className={`border-t border-[#2f4553] bg-[#0f212e] flex flex-col transition-all duration-300 ease-in-out shadow-[0_-4px_20px_rgba(0,0,0,0.4)] ${isBetSlipExpanded ? 'h-[60%]' : 'h-20'}`}>
          {/* Bet Slip Header / Toggle */}
          <button 
            onClick={toggleBetSlip}
            className="w-full flex justify-between items-center p-6 bg-[#0f212e] hover:bg-[#1a2c38] transition-colors border-b border-[#2f4553] group"
          >
              <div className="flex items-center gap-3">
                  <span className="font-bold text-lg text-white group-hover:text-[#00e701] transition-colors uppercase tracking-wide">Bet Slip</span>
                  {outcomes.length > 0 && (
                      <span className="bg-[#00e701] text-[#0f212e] font-bold text-sm px-2.5 py-0.5 rounded-full shadow-sm">{outcomes.length}</span>
                  )}
              </div>
              <div className="flex items-center gap-3 text-[#b1bad3] group-hover:text-white transition-colors">
                  <span className="text-sm font-bold uppercase tracking-wider">{isBetSlipExpanded ? 'Minimize' : 'Expand'}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform duration-300 ${isBetSlipExpanded ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                  </svg>
              </div>
          </button>
          
          {/* Bet Slip Content */}
          <div className="flex-1 overflow-hidden relative bg-[#1a2c38]">
              <BetSlip />
          </div>
      </div>
    </div>
  );
}
