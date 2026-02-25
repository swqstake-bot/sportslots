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
  const fixturesRef = useRef<Fixture[]>([]);
  const emptyResponseCount = useRef(0);
  /** Aktueller Sport, für den die Anzeige gilt. Verhindert, dass ein alter Fetch (z. B. Soccer) nach Wechsel zu Tennis die Liste überschreibt. */
  const currentSportRef = useRef(sportSlug);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sportSlug || !enabled) return;

    currentSportRef.current = sportSlug;
    let timeoutId: ReturnType<typeof setTimeout>;
    let isFirstLoad = true;

    const fetchFixtures = async () => {
      const slugForThisFetch = currentSportRef.current;
      try {
        let response;
        let newFixtures: Fixture[] = [];

        if (slugForThisFetch === 'live' || slugForThisFetch === 'upcoming') {
           response = await StakeApi.query<any>(Queries.FixtureList, {
             type: slugForThisFetch,
             groups: 'main',
             limit: limit,
             offset: 0,
             sportType: 'sport'
           });
           newFixtures = response.data?.fixtureList || [];
        } else {
           response = await StakeApi.query<any>(Queries.SportIndex, {
             sport: slugForThisFetch,
             group: 'main',
             type: type === 'live' ? 'live' : 'upcoming',
             limit: limit
           });
           const firstTournamentList = response.data?.slugSport?.firstTournament || [];
           const firstTournamentFixtures = firstTournamentList[0]?.fixtureList || [];
           const otherTournaments = response.data?.slugSport?.tournamentList || [];
           const otherFixtures = otherTournaments.flatMap((t: any) => t.fixtureList || []);
           const allFixtures = [...firstTournamentFixtures, ...otherFixtures];
           const uniqueMap = new Map();
           allFixtures.forEach((f: any) => {
               if (f && f.id) uniqueMap.set(f.id, f);
           });
           newFixtures = Array.from(uniqueMap.values());
        }

        if (!isMounted.current) return;
        if (currentSportRef.current !== slugForThisFetch) return;

        if (newFixtures.length === 0 && fixturesRef.current.length > 0) {
            emptyResponseCount.current += 1;
            if (emptyResponseCount.current >= 3) {
                 setFixtures([]);
                 fixturesRef.current = [];
            }
        } else {
            emptyResponseCount.current = 0;
            setFixtures(newFixtures);
            fixturesRef.current = newFixtures;
            setError(null);
        }

        setLastUpdated(new Date());
      } catch (err: any) {
        if (isMounted.current && currentSportRef.current === slugForThisFetch) {
          console.error('Failed to fetch fixtures', err);
          if (fixturesRef.current.length === 0) {
            setError(err);
          }
        }
      } finally {
        if (isMounted.current && currentSportRef.current === slugForThisFetch && isFirstLoad) {
             setLoading(false);
             isFirstLoad = false;
        }
      }

      if (enabled && isMounted.current && currentSportRef.current === slugForThisFetch) {
        timeoutId = setTimeout(fetchFixtures, pollingInterval);
      }
    };

    setLoading(true);
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
