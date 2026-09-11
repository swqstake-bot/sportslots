import { useCallback } from 'react';
import { useAutoBetEngine } from '../../hooks/useAutoBetEngine';
import { useVisibilityResume } from '../../hooks/useVisibilityResume';
import { useAutoBetStore } from '../../store/autoBetStore';

export function AutoBetManager() {
  // This hook handles the background logic (fetching, filtering, betting)
  const { processAutoBet } = useAutoBetEngine();

  const handleResume = useCallback(() => {
    // Check fresh state instead of stale closure
    const { isRunning, addLog } = useAutoBetStore.getState();
    if (isRunning && processAutoBet) {
      addLog('App became visible after being hidden. Triggering fresh scan cycle...', 'info');
      processAutoBet();
    }
  }, [processAutoBet]);

  const isRunning = useAutoBetStore((s) => s.isRunning);
  useVisibilityResume(handleResume, isRunning);

  return null;
}
