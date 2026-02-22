import { useState, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';

export interface Fixture {
  id: string;
  name: string;
  slug: string;
  status: string;
  marketCount: number;
  data: {
    startTime: string;
    competitors: any[];
    [key: string]: any;
  };
  eventStatus?: {
    matchStatus: string;
    clock?: { matchTime: string };
    homeScore?: number;
    awayScore?: number;
    [key: string]: any;
  };
  groups: any[];
  sport?: {
    name: string;
    slug: string;
  };
}

interface UseLiveFixturesOptions {
  pollingInterval?: number;
  enabled?: boolean;
  type?: string; // 'upcoming' | 'live'
  limit?: number;
}

export function useLiveFixtures(sportSlug: string, options: UseLiveFixturesOptions = {}) {
  const { 
    pollingInterval = 10000, 
    enabled = true,
    type = 'upcoming',
    limit = 50 
  } = options;

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const isMounted = useRef(true);
  // Keep track of fixtures in a ref to decide whether to show error screen or just a toast/log
  const fixturesRef = useRef<Fixture[]>([]);
  const emptyResponseCount = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sportSlug || !enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let isFirstLoad = true;

    const fetchFixtures = async () => {
      try {
        let response;
        let newFixtures: Fixture[] = [];

        if (sportSlug === 'live' || sportSlug === 'upcoming') {
           // Use General FixtureList query
           response = await StakeApi.query<any>(Queries.FixtureList, {
             type: sportSlug,
             groups: 'main', // String for FixtureList
             limit: limit,
             offset: 0,
             sportType: 'sport'
           });
           newFixtures = response.data?.fixtureList || [];
        } else {
           // Use SportIndex query
           console.log(`Fetching fixtures for ${sportSlug} (${type})`);
           response = await StakeApi.query<any>(Queries.SportIndex, {
             sport: sportSlug,
             group: 'main',
             type: type === 'live' ? 'live' : 'upcoming',
             limit: limit
           });
           
           // Aggregate fixtures from firstTournament and tournamentList
           // Fix: firstTournament is an array (from tournamentList query)
           const firstTournamentList = response.data?.slugSport?.firstTournament || [];
           const firstTournamentFixtures = firstTournamentList[0]?.fixtureList || [];
           
           const otherTournaments = response.data?.slugSport?.tournamentList || [];
           const otherFixtures = otherTournaments.flatMap((t: any) => t.fixtureList || []);
           
           // Combine and Dedup by ID
           const allFixtures = [...firstTournamentFixtures, ...otherFixtures];
           const uniqueMap = new Map();
           allFixtures.forEach((f: any) => {
               if (f && f.id) uniqueMap.set(f.id, f);
           });
           newFixtures = Array.from(uniqueMap.values());
        }

        if (!isMounted.current) return;

        // Anti-Flicker Logic:
        // If we get an empty list but we have existing fixtures,
        // we might be hitting an API glitch or incomplete sync.
        // We only clear the list if we get empty results multiple times in a row,
        // or if it's the very first load.
        if (newFixtures.length === 0 && fixturesRef.current.length > 0) {
            emptyResponseCount.current += 1;
            console.warn(`Received empty fixture list. Ignoring (Attempt ${emptyResponseCount.current}/3)`);
            
            if (emptyResponseCount.current >= 3) {
                 // Really empty after 3 tries
                 setFixtures([]);
                 fixturesRef.current = [];
            }
            // Else: Keep old fixtures (stale-while-revalidate style)
        } else {
            // Normal update
            emptyResponseCount.current = 0;
            
            // Optimization: Only update state if IDs have changed to avoid re-renders?
            // React handles shallow compare, but object refs are new.
            // For now, just setting it is fine.
            setFixtures(newFixtures);
            fixturesRef.current = newFixtures;
            setError(null);
        }

        setLastUpdated(new Date());
      } catch (err: any) {
        if (isMounted.current) {
          console.error('Failed to fetch fixtures', err);
          // Only set error state if we have no fixtures to show
          // This prevents the UI from replacing the list with an error message during polling
          if (fixturesRef.current.length === 0) {
            setError(err);
          }
        }
      } finally {
        if (isMounted.current) {
          // Only change loading state if it was the first load
          if (isFirstLoad) {
             setLoading(false);
             isFirstLoad = false;
          }
        }
      }

      if (enabled && isMounted.current) {
        timeoutId = setTimeout(fetchFixtures, pollingInterval);
      }
    };

    setLoading(true);
    // Reset fixtures only on sport change to show loading state
    // setFixtures([]); // Optional: keep old fixtures while loading new sport? Better to clear.
    setFixtures([]); 
    fixturesRef.current = [];
    emptyResponseCount.current = 0;
    
    fetchFixtures();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [sportSlug, pollingInterval, enabled, type, limit]);

  return { fixtures, loading, error, lastUpdated };
}
