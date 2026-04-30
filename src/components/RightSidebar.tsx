import { useUiStore } from '../store/uiStore';
import { AutoBetView } from './AutoBet/AutoBetView';
import { ActiveBetsList, ActiveBetsModal } from './ActiveBets';

export function RightSidebar() {
  const { rightSidebarTab, setRightSidebarTab, isActiveBetsModalOpen, activeBetsPreviewBetId, closeActiveBetsModal } = useUiStore();

  return (
    <aside className="sports-right-rail">
      {isActiveBetsModalOpen && (
        <ActiveBetsModal
          onClose={closeActiveBetsModal}
          initialPreviewBetId={activeBetsPreviewBetId}
        />
      )}

      <div className="sports-right-rail-tabs">
        {(['activebets', 'autobet'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
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
    </aside>
  );
}
