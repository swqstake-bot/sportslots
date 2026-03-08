import { useState, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';

/**
 * Fetches live fixture count for Sidebar display.
 * Polls only when sports view is active.
 */
export function useLiveFixtureCount(enabled: boolean, pollingIntervalMs = 15000) {
  const [count, setCount] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }

    const fetchCount = async () => {
      try {
        const response = await StakeApi.query<{ fixtureCount?: number; fixtureList?: unknown[] }>(
          Queries.FixtureList,
          { type: 'live', groups: 'main', limit: 1, offset: 0, sportType: 'sport' }
        );
        const n = response.data?.fixtureCount;
        setCount(typeof n === 'number' ? n : 0);
      } catch {
        setCount(null);
      }
    };

    fetchCount();
    timeoutRef.current = setInterval(fetchCount, pollingIntervalMs);
    return () => {
      if (timeoutRef.current) clearInterval(timeoutRef.current);
    };
  }, [enabled, pollingIntervalMs]);

  return count;
}
