import { useUiStore } from '../../store/uiStore';
import type { SportBet } from '../../store/userStore';
import { BetPreviewPanel, type BetPreviewPanelProps } from './BetPreviewPanel';

interface BetPreviewModalProps extends Pick<BetPreviewPanelProps, 'matchSearch' | 'onMatchSearchChange'> {
  bet: SportBet;
  onClose: () => void;
  onCashout?: (betId: string, multiplier: number) => void;
  usdRates?: Record<string, number>;
}

export function BetPreviewModal({ bet, matchSearch, onMatchSearchChange, onClose, onCashout, usdRates = {} }: BetPreviewModalProps) {
  const currentView = useUiStore((s) => s.currentView);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] backdrop-blur-sm"
      data-app-mode={currentView}
      onClick={onClose}
    >
      <div className="rounded-xl shadow-2xl w-[96vw] max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <BetPreviewPanel
          key={bet.id}
          bet={bet}
          matchSearch={matchSearch}
          onMatchSearchChange={onMatchSearchChange}
          onClose={onClose}
          onCashout={onCashout}
          usdRates={usdRates}
          variant="modal"
        />
      </div>
    </div>
  );
}
