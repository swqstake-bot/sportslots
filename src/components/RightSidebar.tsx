import { useUiStore } from '../store/uiStore';
import { ActiveBetsList, ActiveBetsModal } from './ActiveBets';

export function RightSidebar() {
  const { isActiveBetsModalOpen, activeBetsPreviewBetId, closeActiveBetsModal } = useUiStore();

  return (
    <aside className="sports-right-rail">
      {isActiveBetsModalOpen && (
        <ActiveBetsModal
          onClose={closeActiveBetsModal}
          initialPreviewBetId={activeBetsPreviewBetId}
        />
      )}

      <div className="sports-right-rail-header">
        <span className="sports-right-rail-title">Active Bets</span>
      </div>

      <div className="sports-right-rail-content">
        <div className="h-full overflow-hidden">
          <ActiveBetsList />
        </div>
      </div>
    </aside>
  );
}
