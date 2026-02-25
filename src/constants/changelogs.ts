export const CHANGELOGS: Record<string, string[]> = {
  '1.0.34': [
    'Feature: Active Bets - Auto Cashout (Profit Threshold)',
    'Feature: Active Bets - Real-time Cashout Preview',
    'Feature: Active Bets - Filter/Sort (Status, Time)',
    'Improvement: Reduced API Rate Limits (Error 1015 fix)',
    'Fix: Crash on Refresh Cashout Offers',
    'Fix: CasinoView Hook Dependencies'
  ],
  '1.0.27': [
    'Feature: "Uncheck Bonus" Button in Bonus Hunt (Removes "Has Bonus" from all slots)',
    'Fix: Hacksaw Session UUID missing error (Added retry logic)',
    'Improvement: Better error handling for Hacksaw API',
  ],
  '1.0.26': [
    'Feature: Quarter Line detection for Stake Shield exclusion',
    'Feature: Esport Filter updates (CS2, Crossfire)',
  ],
  '1.0.25': [
    'Feature: AutoChallengeHunter Availability Logic',
    'Fix: Active Bets iid Issue',
  ],
  '1.0.22': [
    'Feature: "Fill Up" Mode (Pauses at 150 bets, retries every 3 mins)',
    'Feature: "Cover with Shield" (Duplicate bet with Stake Shield)',
  ]
}

export const getChangelogForVersion = (version: string) => {
  return CHANGELOGS[version] || []
}
