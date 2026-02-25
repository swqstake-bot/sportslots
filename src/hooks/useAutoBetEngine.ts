import { useEffect, useRef, useState, useCallback } from 'react';
import { useAutoBetStore } from '../store/autoBetStore';
import { useUserStore } from '../store/userStore';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { fetchCurrencyRates } from '../components/Casino/api/stakeChallenges';

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
    // Always get fresh state
    const { settings, isRunning: currentIsRunning } = useAutoBetStore.getState();
    const currentUser = useUserStore.getState().user;
    const currentBalances = useUserStore.getState().balances;

    if (processingRef.current || !currentIsRunning || !currentUser) return;
    
    processingRef.current = true;
    setIsProcessing(true);
    addLog('Starting AutoBet cycle...', 'info');

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
            addLog('Active bets limit (150) reached. Fill Up Mode: Waiting 3 minutes before retrying...', 'warning');
            processingRef.current = false;
            setIsProcessing(false);
            
            // Set 3 minute timeout
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(processAutoBet, 180000); 
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
      
      // 2. Determine Sports to Scan
      let sportsToScan: { name: string; slug: string; type?: string }[] = [];

      if (settings.sportSlug === 'starting_soon') {
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
            
            try {
                let fixtures: any[] = [];

                if (sport.slug === 'starting_soon') {
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
                
                // Event Filter (Keywords)
                if (settings.eventFilter && settings.eventFilter.trim().length > 0) {
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
                                isLive: (fixture.status === 'live' || fixture.status === 'in_progress') // Explicitly check status
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

      // 5. Shuffle and Pick
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

      while (placedBetsCount.current < settings.numberOfBets && useAutoBetStore.getState().isRunning) {
        // Refresh settings inside the loop to catch UI changes immediately
        const currentSettings = useAutoBetStore.getState().settings;
        
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

        // Shuffle candidates for this specific bet
        candidates.sort(() => Math.random() - 0.5);

        const selections: any[] = [];
        const usedFixtures = new Set<string>();
        const minLegsToUse = currentSettings.stakeShield?.enabled 
            ? Math.max(currentSettings.minLegs, (currentSettings.stakeShield.legsThatCanLose || 0) + 1, 3) 
            : currentSettings.minLegs;

        const maxLegsToUse = Math.max(currentSettings.maxLegs, minLegsToUse);

        const targetLegs = Math.min(
            maxLegsToUse, 
            Math.max(minLegsToUse, Math.floor(Math.random() * (maxLegsToUse - minLegsToUse + 1)) + minLegsToUse)
        );

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

        for (const cand of candidates) {
            if (selections.length >= targetLegs) break;
            if (usedFixtures.has(cand.fixtureId)) continue;
            
            // Check mixing
            if (!isCompatible(cand, selections)) continue;

            selections.push(cand);
            usedFixtures.add(cand.fixtureId);
        }

        if (selections.length < minLegsToUse) {
            addLog(`Could not form a valid bet slip with ${minLegsToUse} unique fixtures. Retrying selection...`, 'warning');
            consecutiveFailures++;
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // 6. Place Bet
        const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
        addLog(`Placing bet ${placedBetsCount.current + 1}/${currentSettings.numberOfBets}: ${selections.length} legs, Odds: ${totalOdds.toFixed(2)}`, 'info');

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
                addActiveBet(betRes.data.sportBet);
            } else {
                const betData = betRes.data?.createSportBet || betRes.data?.sportBet;
                if (betData) {
                    betPlaced = true;
                    betId = betData.id;
                    addActiveBet(betData);
                }
            }

            if (betPlaced) {
                placedBetsCount.current += 1;
                localAvailableBalance -= loopCryptoAmount; // Deduct locally
                betsInBatch++;
                consecutiveFailures = 0; // Reset failure count
                addLog(`Bet placed successfully! ID: ${betId} (${placedBetsCount.current}/${currentSettings.numberOfBets})`, 'success');
                
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
                                const coverId = coverRes.data?.sportBet?.id || coverRes.data?.createSportBet?.id;
                                addLog(`Cover Bet placed successfully! ID: ${coverId} (Shielded)`, 'success');
                                placedBetsCount.current += 1; // Count towards total? Yes, it's a bet.
                                localAvailableBalance -= loopCryptoAmount;
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

                // Small delay between bets to avoid rate limits
                await new Promise(r => setTimeout(r, 250));
            } else {
                addLog('Bet placement failed (API returned null or error)', 'error');
                console.error('Bet placement response:', betRes);
                consecutiveFailures++;
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (err: any) {
            addLog(`Error placing bet: ${err.message}`, 'error');
            consecutiveFailures++;
            await new Promise(r => setTimeout(r, 2000));
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
      
      // Schedule next run if still running
      if (useAutoBetStore.getState().isRunning) {
        timeoutRef.current = setTimeout(processAutoBet, 30000); // 30 seconds interval
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
