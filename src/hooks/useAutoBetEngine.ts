import { useEffect, useRef, useState, useCallback } from 'react';
import { useAutoBetStore } from '../store/autoBetStore';
import { useUserStore } from '../store/userStore';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { setShieldOdds } from '../store/shieldOddsCache';
import { fetchCurrencyRates } from '../components/Casino/api/stakeChallenges';
import { resolveTournamentScope } from '../utils/tournamentScope';

// Helper to generate UUID for bets
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Check if sport is Esport
const isEsport = (slug: string) => {
  const esports = ['esports', 'csgo','crossfire','cs2', 'dota2', 'league-of-legends', 'valorant', 'call-of-duty', 'rainbow-six', 'starcraft', 'fifa', 'nba2k','LoL', 'ecricket'];
  return esports.some(e => slug.toLowerCase().includes(e));
};

/** Anstoßzeit aus SportFixture (data Match/Outright); fehlt → +∞ damit ans Ende sortiert. */
function getFixtureStartTimeMs(fixture: any): number {
  const d = fixture?.data;
  if (!d || typeof d !== 'object') return Number.MAX_SAFE_INTEGER;
  const raw = (d as { startTime?: unknown; endTime?: unknown }).startTime ?? (d as { endTime?: unknown }).endTime;
  if (raw == null || raw === '') return Number.MAX_SAFE_INTEGER;
  const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * Upcoming: nächste Spiele zuerst (kein Zufall, sonst landen Scheine auf weit entfernten Partien).
 * Live-only: weiter zufällig mischen. All: zuerst Live, dann Upcoming nach Anstoß.
 */
function sortSportBetCandidates(
  candidates: Array<{ fixtureStartTimeMs?: number; isLive?: boolean }>,
  gameType: 'live' | 'upcoming' | 'all',
  forceUpcoming: boolean
): void {
  const upcomingOnly = forceUpcoming || gameType === 'upcoming';
  const liveOnly = gameType === 'live' && !forceUpcoming;
  if (liveOnly) {
    candidates.sort(() => Math.random() - 0.5);
    return;
  }
  if (upcomingOnly) {
    candidates.sort(
      (a, b) => (a.fixtureStartTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.fixtureStartTimeMs ?? Number.MAX_SAFE_INTEGER)
    );
    return;
  }
  candidates.sort((a, b) => {
    const aLive = a.isLive ? 0 : 1;
    const bLive = b.isLive ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return (a.fixtureStartTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.fixtureStartTimeMs ?? Number.MAX_SAFE_INTEGER);
  });
}

/**
 * slugTournament.fixtureList expects SportSearchEnum; Stake uses `active` for open markets (see TournamentIndex),
 * not `upcoming`. Passing `upcoming` can trigger API validation errors (e.g. error.number_less_equal).
 */
function mapTournamentFixtureListType(scanType: string): string {
  if (scanType === 'live') return 'live';
  return 'active';
}

const TOURNAMENT_FIXTURE_LIMIT_CAP = 50;

/** Kanonische Signatur einer Kombination (Reihenfolge egal). */
function slipSignature(outcomeIds: Array<string | number | undefined>): string {
  return outcomeIds
    .filter((x) => x != null && x !== '')
    .map(String)
    .sort()
    .join('\u0000');
}

function clampTournamentFixtureLimit(scanLimit: number | undefined): number {
  const n = scanLimit && scanLimit > 0 ? scanLimit : 50;
  return Math.min(Math.max(1, n), TOURNAMENT_FIXTURE_LIMIT_CAP);
}

export function useAutoBetEngine() {
  const { isRunning, addLog, stop } = useAutoBetStore();
  const { addActiveBet } = useUserStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placedBetsCount = useRef(0);

  // Reset count when starting
  useEffect(() => {
    if (isRunning) {
      placedBetsCount.current = 0;
    }
  }, [isRunning]);

  const processAutoBet = useCallback(async () => {
    // Always get fresh state from store (so Stop → change settings → Start uses new values)
    const { settings, isRunning: currentIsRunning } = useAutoBetStore.getState();
    const currentUser = useUserStore.getState().user;
    const currentBalances = useUserStore.getState().balances;

    if (processingRef.current || !currentIsRunning || !currentUser) return;
    
    processingRef.current = true;
    setIsProcessing(true);
    let scheduled150Retry = false;

    const tournamentParsed = resolveTournamentScope(settings);
    const startParts = [`Sport setting: ${settings.sportSlug}`, `GameType: ${settings.gameType}`];
    if (tournamentParsed) {
      startParts.push(
        `Turnier: /sports/${tournamentParsed.sport}/${tournamentParsed.category}/${tournamentParsed.tournament}`
      );
    }
    if (tournamentParsed && settings.fillUpEventMaxLegs) {
      startParts.push('Event fill mode: max. Legs pro Turnier (Max Legs als Obergrenze)');
    }
    if (settings.fillUp) {
      startParts.push('Fill-Up: bis 150 aktive Wetten');
    }
    addLog(`Starting AutoBet cycle… (${startParts.join(' · ')})`, 'info');

    if (placedBetsCount.current >= settings.numberOfBets && !settings.fillUp) {
      addLog(`Target number of bets reached (${settings.numberOfBets}). Stopping.`, 'success');
      stop();
      processingRef.current = false;
      setIsProcessing(false);
      return;
    }

    try {
      // 0. Fetch Currency Rates (for USD conversion)
      let ratesMap: Record<string, number> = {};
      try {
        const rates = await fetchCurrencyRates('');
        if (rates) ratesMap = rates;
      } catch (err) {
        console.warn("Failed to fetch currency rates", err);
        if (settings.currency.toLowerCase() !== 'usd') {
             addLog(`CRITICAL: Failed to fetch currency rates. Stopping for safety.`, 'error');
             stop();
             processingRef.current = false;
             setIsProcessing(false);
             return;
        }
      }

      // 0. Check Active Bets Limit (150)
      // Check for limit of active bets (150 is the hard limit)
      // We check if we can fetch a bet at offset 149, it means we have at least 150 active bets.
      let isLimitReached = false;
      
      try {
        const activeBetsCheck = await StakeApi.query<any>(Queries.FetchActiveSportBets, {
          limit: 1,
          offset: 149,
          name: currentUser.name
        });
        
        if (activeBetsCheck.data?.user?.activeSportBets && activeBetsCheck.data.user.activeSportBets.length > 0) {
            isLimitReached = true;
        }
      } catch (err) {
          // If query fails, assume not reached to be safe, or log warning
          console.warn("Failed to check active bets limit", err);
      }

      if (isLimitReached) {
        if (settings.fillUp) {
            const waitMs = 60000 + Math.random() * 120000; // 1–3 min zufällig
            const eventFillNote =
              tournamentParsed && settings.fillUpEventMaxLegs ? ' · Event fill mode bleibt aktiv' : '';
            addLog(
              `Active bets limit (150) reached. Fill Up: Pause ${Math.round(waitMs / 60000)} min, dann erneut scannen.${eventFillNote}`,
              'warning'
            );
            processingRef.current = false;
            setIsProcessing(false);
            
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(processAutoBet, waitMs);
            return;
        } else {
            addLog('Active bets limit (150) reached. Cannot place more bets until some settle.', 'error');
            stop();
            processingRef.current = false;
            setIsProcessing(false);
            return;
        }
      }

      // 1. Check Balance
      const currentBalance = currentBalances[settings.currency.toLowerCase()] || 0;
      
      let initialExchangeRate = 1;
      const initialCurrency = settings.currency.toLowerCase();
      if (initialCurrency !== 'usd') {
         if (ratesMap[initialCurrency]) {
             initialExchangeRate = ratesMap[initialCurrency];
             addLog(`Exchange Rate: 1 ${settings.currency.toUpperCase()} = $${initialExchangeRate.toFixed(2)}`, 'info');
         } else {
             addLog(`CRITICAL: Exchange rate missing for ${settings.currency}. Stopping.`, 'error');
             stop();
             return;
         }
      }

      const initialCryptoAmount = parseFloat((settings.amount / initialExchangeRate).toFixed(8));
      
      if (currentBalance < initialCryptoAmount) {
        addLog(`Insufficient balance: ${currentBalance} ${settings.currency} < ${initialCryptoAmount} (${settings.amount} USD)`, 'error');
        stop();
        return;
      }

      // If we are in fillUp mode and we've reached the target number of bets for this session, 
      // but NOT the global 150 limit, we should technically pause or stop?
      // No, user said: "Wenn nicht füllt er wieder auf, also quasi nicht anzahl an wetten sondern 'fill up'"
      // So if fillUp is ON, we ignore 'numberOfBets' setting essentially, or we treat numberOfBets as "bets per batch"?
      // The user instruction implies: "Keep betting until 150 active bets is reached".
      // So we should probably ignore `placedBetsCount` check if fillUp is active, OR user sets a high number.
      // Let's assume numberOfBets is still a safety cap per run, but for fillUp we might want to override it?
      // For now, let's stick to the logic: if 150 limit is NOT reached, we continue.
      
      if (!tournamentParsed && settings.eventTournamentUrl?.trim()) {
        addLog('Invalid Event URL: paste a Stake link containing /sports/{sport}/{category}/{tournament}', 'error');
        stop();
        processingRef.current = false;
        setIsProcessing(false);
        return;
      }

      // 2. Determine Sports to Scan
      let sportsToScan: { name: string; slug: string; type?: string }[] = [];

      if (tournamentParsed) {
        sportsToScan = [{ name: tournamentParsed.tournament, slug: tournamentParsed.sport }];
        addLog(
          `Lade Turnier: /sports/${tournamentParsed.sport}/${tournamentParsed.category}/${tournamentParsed.tournament}` +
            (settings.fillUpEventMaxLegs ? ' · Event fill mode aktiv' : ''),
          'info'
        );
      } else if (settings.sportSlug === 'starting_soon') {
        // "Starting Soon" uses a single mixed query, so we create a dummy "sport" entry to trigger the loop once
        sportsToScan = [{ name: 'Starting Soon', slug: 'starting_soon' }];
        addLog('Scanning "Starting Soon" fixtures (Mixed Sports)...', 'info');
      } else if (settings.sportSlug && settings.sportSlug !== 'all') {
        sportsToScan = [{ name: settings.sportSlug, slug: settings.sportSlug }];
        addLog(`Targeting specific sport: ${settings.sportSlug}`, 'info');
      } else {
        // Fetch Top Sports (Standard "All" behavior)
        // Force 'upcoming' if Shield is enabled OR Ignore Live Games is checked
        const forceUpcoming = settings.stakeShield?.enabled || settings.ignoreLiveGames;
        
        if (settings.stakeShield?.enabled && settings.gameType === 'live') {
             addLog('Stake Shield enabled: Switching to "Upcoming" games only (Shield not supported on Live).', 'warning');
        } else if (settings.ignoreLiveGames && settings.gameType === 'live') {
             addLog('Ignore Live Games enabled: Switching to "Upcoming" games only.', 'warning');
        }
        
        const typeParam = forceUpcoming ? 'upcoming' : (settings.gameType === 'live' ? 'live' : 'upcoming'); 
        
        const sportRes = await StakeApi.query<any>(Queries.SportListMenu, {
          type: typeParam,
          limit: 10,
          offset: 0,
          sportType: 'sport'
        });

        if (!sportRes.data?.sportList) {
          throw new Error('Failed to fetch sports list');
        }
        sportsToScan = sportRes.data.sportList.slice(0, 5); // Limit to top 5
        const sportNames = sportsToScan.map(s => s.name).join(', ');
        addLog(`Scanning top sports: ${sportNames}`, 'info');
      }

      const candidates: any[] = [];

      // 3. Fetch Fixtures for each sport
      const rejections = { status: 0, odds: 0, marketStatus: 0, outcomeStatus: 0, noMarkets: 0 };
      let consecutiveMarketInactive = 0; // Track consecutive inactive markets to trigger reload
      let tournamentProcessed = false;

      for (const sport of sportsToScan) {
        // Check running state again between fetches
        if (!useAutoBetStore.getState().isRunning) break;

        // Force upcoming if Shield is enabled OR if Ignore Live Games is checked
        const forceUpcoming = settings.stakeShield?.enabled || settings.ignoreLiveGames;
        
        // Determine types to fetch based on settings
        // If forceUpcoming is true, we ONLY fetch 'upcoming'
        // Otherwise we respect the gameType setting (live, upcoming, or all)
        const typesToFetch = forceUpcoming ? ['upcoming'] : (settings.gameType === 'all' ? ['live', 'upcoming'] : [settings.gameType]);

        for (const type of typesToFetch) {
            if (tournamentParsed && tournamentProcessed) continue;
            if (!useAutoBetStore.getState().isRunning) break;
            try {
                let fixtures: any[] = [];

                if (tournamentParsed) {
                    tournamentProcessed = true;
                    const loadTournamentFixtures = async (group: string) => {
                        const map = new Map<string, any>();
                        const apiLimit = clampTournamentFixtureLimit(settings.scanLimit);
                        for (const t of typesToFetch) {
                            const apiType = mapTournamentFixtureListType(t);
                            const fixtureRes = await StakeApi.query<any>(Queries.SlugTournamentFixtureList, {
                                sport: tournamentParsed.sport,
                                category: tournamentParsed.category,
                                tournament: tournamentParsed.tournament,
                                group,
                                type: apiType,
                                limit: apiLimit,
                            });
                            const slugTournament = fixtureRes.data?.slugTournament;
                            if (!slugTournament) {
                                addLog(
                                    `slugTournament not found for ${tournamentParsed.sport}/${tournamentParsed.category}/${tournamentParsed.tournament} (API type: ${apiType}, group: ${group})`,
                                    'warning'
                                );
                                continue;
                            }
                            for (const f of slugTournament.fixtureList || []) {
                                if (f?.id) map.set(f.id, f);
                            }
                        }
                        return Array.from(map.values()).slice(0, settings.scanLimit || 50);
                    };
                    fixtures = await loadTournamentFixtures('main');
                    if (fixtures.length === 0 && tournamentParsed.sport === 'mma') {
                        addLog('Tournament: no fixtures with group "main", retrying with "threeway"...', 'warning');
                        fixtures = await loadTournamentFixtures('threeway');
                    }
                    addLog(
                        `Tournament fixtures: ${fixtures.length} (API: ${typesToFetch.map(mapTournamentFixtureListType).join(', ')}, limit ≤${TOURNAMENT_FIXTURE_LIMIT_CAP})`,
                        'info'
                    );
                } else if (sport.slug === 'starting_soon') {
                    // Special Query for Starting Soon (Mixed)
                    // Use FixtureList query which supports mixed sports
                    // "upcoming" type usually sorts by time
                    const fixtureRes = await StakeApi.query<any>(Queries.FixtureList, {
                        type: 'upcoming',
                        groups: 'main',
                        offset: 0,
                        limit: Math.min(settings.scanLimit || 50, 50),
                        sportType: 'sport'
                    });

                    if (fixtureRes.data?.fixtureList) {
                        fixtures = fixtureRes.data.fixtureList;
                    }
                } else {
                    // Standard Sport Specific Query
                    const fixtureRes = await StakeApi.query<any>(Queries.SportIndex, {
                  sport: sport.slug,
                  group: 'main',
                  type: forceUpcoming ? 'upcoming' : (type === 'live' ? 'live' : 'upcoming'),
                  limit: Math.min(settings.scanLimit || 50, 50) // Cap at 50 for API request
                });
    
                    // Aggregate fixtures from firstTournament AND tournamentList (same logic as useLiveFixtures)
                    const slugSport = fixtureRes.data?.slugSport;
                    if (!slugSport) {
                        continue;
                    }
    
                    const firstTournamentList = slugSport.firstTournament || [];
                    const firstTournamentFixtures = firstTournamentList[0]?.fixtureList || [];
                    const otherTournaments = slugSport.tournamentList || [];
                    const otherFixtures = otherTournaments.flatMap((t: any) => t.fixtureList || []);
                    
                    // Combine and Dedup by ID
                    const allFixturesRaw = [...firstTournamentFixtures, ...otherFixtures];
                    const uniqueMap = new Map();
                    allFixturesRaw.forEach((f: any) => {
                        if (f && f.id) uniqueMap.set(f.id, f);
                    });
                    // Slice to user's desired limit (even if > 50, because we aggregated multiple tournaments)
                    fixtures = Array.from(uniqueMap.values()).slice(0, settings.scanLimit || 50);
                }
                
                // addLog(`Found ${fixtures.length} fixtures for ${sport.name} (${type})`, 'info');
                
                // 4. Extract Candidates (Outcomes)
                for (const fixture of fixtures) {
                if (!useAutoBetStore.getState().isRunning) break;
                // If we hit too many inactive markets, we might want to break early and re-fetch (or just let it continue)
                if (consecutiveMarketInactive > 10) {
                     addLog(`Too many consecutive inactive markets (>10). Stopping current scan to refresh fixtures.`, 'warning');
                     break; // Break fixture loop
                }

                // For live games, status might be 'active' or 'live'
                // For upcoming, status is usually 'scheduled' or 'active'
                // Let's rely on the query result mainly, but check basic status
                if (fixture.status === 'cancelled' || fixture.status === 'suspended') {
                    rejections.status++;
                    continue;
                }
                
                // Stake Shield Strict Check for Live Games (using JSON status)
                // Even if we requested 'upcoming', API might return live games.
                // Status 'live' or 'in_progress' is not allowed for Shield OR if Ignore Live Games is checked.
                if (settings.stakeShield?.enabled || settings.ignoreLiveGames) {
                    const status = (fixture.status || '').toLowerCase();
                    if (status === 'live' || status === 'in_progress') {
                        // console.log(`Skipping live fixture ${fixture.name} because Shield is enabled or Ignore Live is checked.`);
                        rejections.status++;
                        continue;
                    }
                }
                
                // Event Filter (Keywords) — skipped when a tournament URL scopes fixtures already
                if (!tournamentParsed && settings.eventFilter && settings.eventFilter.trim().length > 0) {
                    const filterText = settings.eventFilter.toLowerCase();
                    const fixtureName = (fixture.name || '').toLowerCase();
                    const tournamentName = (fixture.tournament?.name || '').toLowerCase();
                    const categoryName = (fixture.tournament?.category?.name || '').toLowerCase();
                    
                    // Check if any of the names contain the filter text
                    const matches = fixtureName.includes(filterText) || 
                                  tournamentName.includes(filterText) || 
                                  categoryName.includes(filterText);
                                  
                    if (!matches) continue;
                }

                // Fetch Detailed Markets (Undercards)
                let fixtureGroups = fixture.groups;
                
                if (!fixture.slug) {
                    console.warn(`Fixture ${fixture.name} has no slug, skipping details fetch`);
                } else {
                    try {
                        // Fetch details to find more markets (undercards)
                        // Use a broad list of groups to cover most sports
                        // Removed 'all' to avoid potential conflict, focused on specific market groups
                        const groupList = ['main', 'match', 'score', 'quarters', 'halves', 'innings', 'sets', 'rounds', 'points', 'goals', 'corners', 'cards', 'player_props', 'fight_lines', 'method_of_victory'];
                        
                        // Only fetch details if we really need them (e.g. if main groups are empty or we want deep markets)
                        // For now, always fetch to ensure we see everything as requested
                        const detailsRes = await StakeApi.query<any>(Queries.FetchFixtureMarkets, {
                            fixture: fixture.slug,
                            groups: groupList
                        });
                        
                        if (detailsRes.data?.slugFixture?.groups) {
                            fixtureGroups = detailsRes.data.slugFixture.groups;
                        } else {
                            // console.warn(`No groups found in details for ${fixture.name} (slug: ${fixture.slug})`);
                        }
                    } catch (err) {
                        console.warn(`Failed to fetch details for ${fixture.name}`, err);
                        // Continue with basic groups
                    }
                }

                // Check Odds and Market
                let hasMarkets = false;
                if (fixtureGroups) {
                    for (const group of fixtureGroups) {
                    if (group.templates) {
                        for (const template of group.templates) {
                        // Usually Winner or Match Winner
                        if (!template.markets) continue;
                        hasMarkets = true;
                        
                        for (const market of template.markets) {
                            // Relax status check for upcoming games? No, only active markets can be bet on.
                            // But maybe status string is different?
                            if (market.status !== 'active' && market.status !== 'open') {
                                rejections.marketStatus++;
                                consecutiveMarketInactive++; // Increment inactive counter
                                continue;
                            }
                            
                            // Reset counter if we found an active market
                            consecutiveMarketInactive = 0;
                            
                            for (const outcome of market.outcomes) {
                                // Fix: Check outcome.active (boolean) instead of outcome.status (undefined in fragment)
                                if (!outcome.active) {
                                    rejections.outcomeStatus++;
                                    continue;
                                }

                                // Stake Shield: Quarter Lines Check
                                // If Shield is enabled (strict or normal), we must avoid Quarter Lines (e.g. 1.25, 2.75)
                                // Quarter lines usually appear in outcome names like "Over 2.25", "Under 1.75", "Asian Handicap -0.25"
                                if (settings.stakeShield?.enabled) {
                                    const name = outcome.name || '';
                                    // Regex to find numbers ending in .25 or .75
                                    // Matches: 1.25, 2.75, -0.25, +1.75
                                    const isQuarterLine = /\d+\.(25|75)\b/.test(name);
                                    if (isQuarterLine) {
                                        // console.log(`Skipping Quarter Line outcome: ${name}`);
                                        continue;
                                    }
                                }
                            
                            const odds = outcome.odds;
                            if (odds >= settings.minOdds && odds <= settings.maxOdds) {
                                candidates.push({
                                fixtureId: fixture.id,
                                fixtureName: fixture.name,
                                marketId: market.id,
                                outcomeId: outcome.id,
                                outcomeName: outcome.name,
                                odds: odds,
                                sportSlug: sport.slug, // Track sport slug for mixing validation
                                isLive: (fixture.status === 'live' || fixture.status === 'in_progress'), // Explicitly check status
                                fixtureStartTimeMs: getFixtureStartTimeMs(fixture),
                                });
                            } else {
                                rejections.odds++;
                            }
                            }
                        }
                        }
                    }
                    }
                }
                if (!hasMarkets) rejections.noMarkets++;
                }
                
                if (candidates.length > 0) {
                    addLog(`${sport.name} (${type}): Found ${candidates.length} valid candidates.`, 'success');
                } else {
                    // Only log if no candidates found after trying
                    // addLog(`${sport.name} (${type}): No candidates.`, 'info');
                }

            } catch (err: any) {
                console.error(`Error fetching fixtures for ${sport.name} (${type})`, err);
                addLog(`Error scanning ${sport.name} (${type}): ${err.message || 'Unknown error'}`, 'error');
            }
        }
      }

      const forceUpcomingGlobal = settings.stakeShield?.enabled || settings.ignoreLiveGames;
      sortSportBetCandidates(candidates, settings.gameType, forceUpcomingGlobal);

      // 5. Pick (order: upcoming = nächster Anstoß zuerst; live-only = zufällig)
      if (candidates.length === 0) {
        addLog(`No suitable bets found in this scan. Rejections: Status=${rejections.status}, Market=${rejections.marketStatus}, Outcome=${rejections.outcomeStatus}. Retrying in 30s...`, 'info');
        
        // If we broke due to consecutive inactive markets, we should probably retry sooner?
        // But 30s is fine.
        processingRef.current = false;
        setIsProcessing(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(processAutoBet, 30000);
        return;
      }

      // 5. Select Outcomes and Place Bets (Batch Loop)
      let consecutiveFailures = 0;
      let betsInBatch = 0;
      
      // Use a local balance tracker to prevent overspending before the store updates
      let localAvailableBalance = currentBalance;
      /** Nach Sortierung sonst immer dieselben ersten N Legs → gleiche Kombination. Rotieren + Duplikat-Check. */
      let slipRotateOffset = 0;
      /** Bereits in diesem AutoBet-Durchlauf platzierte outcomeId-Kombinationen (nicht erneut wählen). */
      const placedSlipSignatures = new Set<string>();

      // Fill-up: place until 150 (API limit); otherwise cap by numberOfBets. Re-read settings each iteration.
      // WICHTIG: Bei fillUp NICHT auf placedBetsCount prüfen – der zählt nur diese Session und
      // wird nicht zurückgesetzt wenn Wetten settled haben. Wenn z.B. 150 platziert, 10 settled →
      // User hat 140 aktive, könnte 10 mehr platzieren. placedBetsCount=150 würde sonst sofort
      // brechen, obwohl die API noch Kapazität hat. Die API lehnt ab wenn 150 erreicht (Catch-Block).
      while (useAutoBetStore.getState().isRunning) {
        const currentSettings = useAutoBetStore.getState().settings;
        const maxBets = currentSettings.fillUp ? 150 : currentSettings.numberOfBets;
        if (!currentSettings.fillUp && placedBetsCount.current >= maxBets) break;
        
        // Recalculate crypto amount based on current settings (if user changed amount or currency)
        let loopExchangeRate = 1;
        const loopCurrency = currentSettings.currency.toLowerCase();
        
        if (loopCurrency !== 'usd') {
            if (ratesMap[loopCurrency]) {
                loopExchangeRate = ratesMap[loopCurrency];
            } else {
                addLog(`CRITICAL: Exchange rate missing for ${currentSettings.currency}. Stopping.`, 'error');
                stop();
                return;
            }
        }
        
        const loopCryptoAmount = parseFloat((currentSettings.amount / loopExchangeRate).toFixed(8));

        // Safety break if we've tried too many times in one scan without success
        if (consecutiveFailures >= 10) {
            addLog(`Too many consecutive failures (${consecutiveFailures}). Re-scanning to get fresh odds/fixtures.`, 'warning');
            break;
        }

        // Optional: Break after N bets to force a re-scan for fresh odds (e.g. every 10 bets)
        // User requested "fast one after another", so we keep this high or remove it.
        // Let's set a safe batch limit of 100 to ensure we don't use stale data for too long.
        if (betsInBatch >= 100) {
            addLog(`Batch limit reached (100). Re-scanning for fresh data.`, 'info');
            break;
        }

        // Check Balance
        if (localAvailableBalance < loopCryptoAmount) {
            addLog(`Insufficient balance for next bet: ${localAvailableBalance.toFixed(8)} < ${loopCryptoAmount} (${currentSettings.amount} USD)`, 'error');
            stop();
            return;
        }

        const forceUpcomingLoop = currentSettings.stakeShield?.enabled || currentSettings.ignoreLiveGames;
        sortSportBetCandidates(candidates, currentSettings.gameType, forceUpcomingLoop);

        const minLegsToUse = currentSettings.stakeShield?.enabled 
            ? Math.max(currentSettings.minLegs, (currentSettings.stakeShield.legsThatCanLose || 0) + 1, 3) 
            : currentSettings.minLegs;

        const maxLegsToUse = Math.max(currentSettings.maxLegs, minLegsToUse);

        const uniqueFixtureCount = new Set(candidates.map((c) => c.fixtureId)).size;

        let targetLegs: number;
        if (currentSettings.fillUpEventMaxLegs && resolveTournamentScope(currentSettings)) {
            targetLegs = Math.min(uniqueFixtureCount, currentSettings.maxLegs);
        } else {
            targetLegs = Math.min(
                maxLegsToUse,
                Math.max(minLegsToUse, Math.floor(Math.random() * (maxLegsToUse - minLegsToUse + 1)) + minLegsToUse)
            );
        }

        // Helper to check mixing compatibility
        const isCompatible = (newCand: any, currentSelections: any[]) => {
            if (currentSelections.length === 0) return true;
            
            const hasEsport = currentSelections.some(s => isEsport(s.sportSlug));
            const newIsEsport = isEsport(newCand.sportSlug);

            // Cannot mix esport with non-esport
            if (hasEsport && !newIsEsport) return false;
            if (!hasEsport && newIsEsport) return false;

            return true;
        };

        const rotLen = candidates.length;
        const rotN = Math.max(1, rotLen);

        const buildSelectionsFromOffset = (baseOffset: number) => {
          const sel: any[] = [];
          const used = new Set<string>();
          const rotBase = rotLen > 0 ? baseOffset % rotLen : 0;
          const rotatedCandidates =
            rotLen === 0 ? [] : [...candidates.slice(rotBase), ...candidates.slice(0, rotBase)];
          for (const cand of rotatedCandidates) {
            if (sel.length >= targetLegs) break;
            if (used.has(cand.fixtureId)) continue;
            if (!isCompatible(cand, sel)) continue;
            sel.push(cand);
            used.add(cand.fixtureId);
          }
          return sel;
        };

        let selections = buildSelectionsFromOffset(slipRotateOffset);
        let offsetTries = 0;
        while (selections.length >= minLegsToUse && offsetTries < rotN) {
          const sigTry = slipSignature(selections.map((s) => s.outcomeId));
          if (!placedSlipSignatures.has(sigTry)) break;
          offsetTries++;
          slipRotateOffset = (slipRotateOffset + 1) % rotN;
          selections = buildSelectionsFromOffset(slipRotateOffset);
        }

        if (selections.length < minLegsToUse) {
            addLog(`Could not form a valid bet slip with ${minLegsToUse} unique fixtures. Retrying selection...`, 'warning');
            consecutiveFailures++;
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        const slipSig = slipSignature(selections.map((s) => s.outcomeId));
        if (placedSlipSignatures.has(slipSig)) {
            addLog(
              'Keine noch nicht vergebene Kombination in diesem Scan (alle Offsets probiert). Nächster Versuch…',
              'warning'
            );
            slipRotateOffset = (slipRotateOffset + 1) % rotN;
            consecutiveFailures++;
            await new Promise((r) => setTimeout(r, 400));
            continue;
        }

        // 6. Place Bet — kein #n/max bei „Placing“ (Zählung erst nach API-Erfolg, sonst irreführend)
        const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
        addLog(
          `Placing bet: ${selections.length} legs, odds ${totalOdds.toFixed(2)}… (session cap ${maxBets})`,
          'info'
        );

        const outcomeIds = selections.map(s => s.outcomeId);
        const identifier = generateUUID();

        // Stake Shield Logic
        let stakeShieldEnabled = false;
        let stakeShieldProtectionLevel = undefined;
        let stakeShieldOfferOdds = undefined;
        
        if (currentSettings.stakeShield?.enabled) {
            const isStrict = currentSettings.stakeShield.strictMode;

            // 1. Strict Mode Check: No Live Games
            if (isStrict) {
                const hasLiveLegs = selections.some(s => s.isLive);
                if (hasLiveLegs) {
                    addLog('Skipping bet: Stake Shield unavailable for Live games (Strict Mode).', 'warning');
                    consecutiveFailures++;
                    continue; // Skip this bet
                }
            }

            try {
                // 2. Check if eligible (multi bet required)
                if (selections.length < 3) { // Usually requires 3+ legs
                     const msg = `Stake Shield skipped: Requires 3+ legs (Current: ${selections.length}).`;
                     if (isStrict) {
                        addLog(`${msg} Skipping bet (Strict Mode).`, 'warning');
                        consecutiveFailures++;
                        continue;
                     } else {
                        addLog(`${msg} Placing normal bet.`, 'warning');
                     }
                     // Proceed without Shield (if not strict)
                } else {
                    // 3. Fetch Offers
                    const shieldOutcomes = selections.map(s => ({
                        outcomeId: s.outcomeId,
                        betType: 'sports'
                    }));

                    const shieldRes = await StakeApi.query<any>(Queries.StakeShieldOffers, {
                        outcomes: shieldOutcomes
                    });

                    if (shieldRes.data?.stakeShieldOffers?.offers) {
                        const offers = shieldRes.data.stakeShieldOffers.offers;
                        const desiredLegs = currentSettings.stakeShield.legsThatCanLose;
                        
                        // Find the highest available protection that is less than or equal to the desired protection
                        // Sort descending by legsThatCanLose (handle missing field gracefully)
                        const sortedOffers = offers.sort((a: any, b: any) => (b.legsThatCanLose || 0) - (a.legsThatCanLose || 0));
                        
                        const bestOffer = sortedOffers.find((o: any) => (o.legsThatCanLose || 0) <= desiredLegs);
                        
                        if (bestOffer && bestOffer.legsThatCanLose !== undefined) {
                            stakeShieldEnabled = true;
                            stakeShieldProtectionLevel = bestOffer.legsThatCanLose;
                            stakeShieldOfferOdds = bestOffer.offerOdds;
                            addLog(`Stake Shield applied: Protect against ${bestOffer.legsThatCanLose} losses (Desired: ${desiredLegs}). New Odds: ${bestOffer.offerOdds.toFixed(2)}`, 'info');
                        } else {
                            const msg = `Stake Shield unavailable (API mismatch/Quarter Lines). Desired: ${desiredLegs}.`;
                            if (isStrict) {
                                addLog(`${msg} Skipping bet (Strict Mode).`, 'warning');
                                consecutiveFailures++;
                                continue;
                            } else {
                                addLog(`${msg} Placing normal bet.`, 'warning');
                            }
                        }
                    } else {
                         const msg = 'Stake Shield query returned no offers.';
                         if (isStrict) {
                            addLog(`${msg} Skipping bet (Strict Mode).`, 'warning');
                            consecutiveFailures++;
                            continue;
                         } else {
                            addLog(`${msg} Placing normal bet.`, 'warning');
                         }
                    }
                }
            } catch (shieldErr: any) {
                const msg = `Error fetching Stake Shield offers: ${shieldErr.message}.`;
                if (isStrict) {
                    addLog(`${msg} Skipping bet (Strict Mode).`, 'warning');
                    consecutiveFailures++;
                    continue;
                } else {
                    addLog(`${msg} Placing normal bet.`, 'warning');
                }
            }
        }

        try {
            const betVariables: any = {
                amount: loopCryptoAmount,
                currency: currentSettings.currency,
                outcomeIds: outcomeIds.map(id => id.toString()),
                betType: 'sports',
                oddsChange: 'any',
                identifier: identifier
            };

            if (stakeShieldEnabled) {
                betVariables.stakeShieldEnabled = true;
                betVariables.stakeShieldProtectionLevel = stakeShieldProtectionLevel;
                betVariables.stakeShieldOfferOdds = stakeShieldOfferOdds;
            }

            const betRes = await StakeApi.query<any>(Queries.PlaceSportBet, betVariables);

            let betPlaced = false;
            let betId = '';

            if (betRes.data?.sportBet) {
                betPlaced = true;
                betId = betRes.data.sportBet.id;
                const betToAdd = { ...betRes.data.sportBet };
                if (stakeShieldEnabled && stakeShieldOfferOdds != null) {
                    betToAdd.adjustments = { payoutMultiplier: stakeShieldOfferOdds };
                    setShieldOdds(betId, stakeShieldOfferOdds);
                }
                addActiveBet(betToAdd);
            } else {
                const betData = betRes.data?.createSportBet || betRes.data?.sportBet;
                if (betData) {
                    betPlaced = true;
                    betId = betData.id;
                    const betToAdd = { ...betData };
                    if (stakeShieldEnabled && stakeShieldOfferOdds != null) {
                        betToAdd.adjustments = { payoutMultiplier: stakeShieldOfferOdds };
                        setShieldOdds(betId, stakeShieldOfferOdds);
                    }
                    addActiveBet(betToAdd);
                }
            }

            if (betPlaced) {
                placedBetsCount.current += 1;
                localAvailableBalance -= loopCryptoAmount; // Deduct locally
                betsInBatch++;
                consecutiveFailures = 0; // Reset failure count
                addLog(`Bet #${placedBetsCount.current}/${maxBets} placed successfully — ID: ${betId}`, 'success');
                placedSlipSignatures.add(slipSignature(outcomeIds));
                slipRotateOffset = (slipRotateOffset + Math.max(1, selections.length)) % rotN;
                
                // === Cover with Shield Logic ===
                if (currentSettings.coverWithShield && betPlaced) {
                     try {
                        addLog('Cover with Shield: Attempting to place duplicate shielded bet...', 'info');
                        
                        // 1. Fetch Offers for the SAME selections
                        const shieldOutcomes = selections.map(s => ({
                            outcomeId: s.outcomeId,
                            betType: 'sports'
                        }));
                        
                        const shieldRes = await StakeApi.query<any>(Queries.StakeShieldOffers, {
                            outcomes: shieldOutcomes
                        });
                        
                        let coverShieldEnabled = false;
                        let coverShieldProtectionLevel = undefined;
                        let coverShieldOfferOdds = undefined;
                        
                        if (shieldRes.data?.stakeShieldOffers?.offers) {
                            const offers = shieldRes.data.stakeShieldOffers.offers;
                            // Default to max protection if not specified, or use same settings as main shield
                            const desiredLegs = currentSettings.stakeShield?.legsThatCanLose || 1;
                            const sortedOffers = offers.sort((a: any, b: any) => (b.legsThatCanLose || 0) - (a.legsThatCanLose || 0));
                            const bestOffer = sortedOffers.find((o: any) => (o.legsThatCanLose || 0) <= desiredLegs);
                            
                            if (bestOffer) {
                                coverShieldEnabled = true;
                                coverShieldProtectionLevel = bestOffer.legsThatCanLose;
                                coverShieldOfferOdds = bestOffer.offerOdds;
                            }
                        }
                        
                        if (coverShieldEnabled) {
                            const coverIdentifier = generateUUID();
                            const coverBetVariables = {
                                amount: loopCryptoAmount,
                                currency: currentSettings.currency,
                                outcomeIds: outcomeIds.map(id => id.toString()),
                                betType: 'sports',
                                oddsChange: 'any',
                                identifier: coverIdentifier,
                                stakeShieldEnabled: true,
                                stakeShieldProtectionLevel: coverShieldProtectionLevel,
                                stakeShieldOfferOdds: coverShieldOfferOdds
                            };
                            
                            const coverRes = await StakeApi.query<any>(Queries.PlaceSportBet, coverBetVariables);
                            
                            if (coverRes.data?.sportBet || coverRes.data?.createSportBet) {
                                const coverBet = coverRes.data?.sportBet || coverRes.data?.createSportBet;
                                const coverId = coverBet.id;
                                const coverBetToAdd = { ...coverBet };
                                if (coverShieldOfferOdds != null) {
                                    coverBetToAdd.adjustments = { payoutMultiplier: coverShieldOfferOdds };
                                    setShieldOdds(coverId, coverShieldOfferOdds);
                                }
                                addActiveBet(coverBetToAdd);
                                placedBetsCount.current += 1;
                                localAvailableBalance -= loopCryptoAmount;
                                addLog(
                                  `Bet #${placedBetsCount.current}/${maxBets} placed successfully (Cover Shield) — ID: ${coverId}`,
                                  'success'
                                );
                            } else {
                                addLog('Cover Bet skipped: API returned no bet object (Shield might be unavailable).', 'warning');
                            }
                        } else {
                            addLog('Cover Bet skipped: No valid Stake Shield offer found.', 'warning');
                        }
                        
                     } catch (coverErr: any) {
                         // User requested to simply skip if it fails, so we log as warning and continue
                         addLog(`Cover Bet skipped (Error): ${coverErr.message}`, 'warning');
                     }
                }
                // ==============================

                await new Promise((r) => setTimeout(r, 250));
            } else {
                addLog('Bet placement failed (API returned null or error)', 'error');
                console.error('Bet placement response:', betRes);
                consecutiveFailures++;
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (err: any) {
            const rawMsg = String(err?.message || err || '');
            const msg = rawMsg.toLowerCase();
            const isSameBetCooldown =
              msg.includes('same bet') ||
              (msg.includes('wait') && msg.includes('5') && msg.includes('second'));
            if (isSameBetCooldown) {
              addLog('Same-bet (API): rotiere Schein – keine identische Kombination erneut.', 'warning');
              slipRotateOffset = (slipRotateOffset + 1) % Math.max(1, candidates.length);
              continue;
            }
            const is150Limit = msg.includes('150') && (msg.includes('active') || msg.includes('sport bet'));
            if (is150Limit) {
                const currentSettings = useAutoBetStore.getState().settings;
                if (currentSettings.fillUp) {
                    addLog('150 active bets limit (API). Fill Up: Waiting 1–3 min, then re-scanning...', 'warning');
                    scheduled150Retry = true;
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    const delayMs = 60000 + Math.random() * 120000;
                    timeoutRef.current = setTimeout(processAutoBet, delayMs);
                    return;
                } else {
                    addLog('150 active bets limit reached. Stopping.', 'error');
                    stop();
                    return;
                }
            }
            addLog(`Error placing bet: ${err?.message || rawMsg}`, 'error');
            consecutiveFailures++;
            await new Promise((r) => setTimeout(r, 2000));
        }
      }
      
      // If we finished the loop because we reached the target
      if (placedBetsCount.current >= settings.numberOfBets && !settings.fillUp) {
          addLog(`Target number of bets reached (${settings.numberOfBets}). Stopping.`, 'success');
          stop();
          return; // Stop the cycle
      }

    } catch (err: any) {
      addLog(`Error during AutoBet cycle: ${err.message}`, 'error');
      console.error(err);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      if (useAutoBetStore.getState().isRunning && !scheduled150Retry) {
        timeoutRef.current = setTimeout(processAutoBet, 30000);
      }
    }
  }, [addLog, stop, addActiveBet]);

  useEffect(() => {
    if (isRunning && !processingRef.current) {
      processAutoBet();
    }
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isRunning, processAutoBet]); // Re-run if isRunning changes (to start)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isProcessing };
}
