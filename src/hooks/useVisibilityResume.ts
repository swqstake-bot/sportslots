import { useEffect, useRef } from 'react';

/**
 * Hook to trigger a callback when the page/window becomes visible again after being hidden.
 * Useful for resuming AutoBet/processes after device sleep or tab switching.
 */
export function useVisibilityResume(onResume: () => void, enabled: boolean = true) {
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHiddenRef.current = true;
      } else if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        onResume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onResume, enabled]);
}
