export const CHANGELOGS: Record<string, string[]> = {
  '1.0.74': [
    '✨ Play: Gleicher Slot in verschiedenen Währungen (Stake Engine, Pragmatic, NoLimit)',
    '🐛 Stake Engine: Multiplikatoren/Gewinne korrekt (payoutMultiplier statt winAmount)',
  ],
  '1.0.73': [
    '✨ Slot-Bets: WebSocket houseBets-Subscription – Echtzeit-Updates, keine RGS-Skalierung nötig',
    '🐛 Slot: Vault-Auszahlungen werden nicht mehr fälschlich als Spin-Gewinn gezählt',
    '🐛 Slot: Nur CasinoBet/SoftswissBet – Vault-/Transfer-Events gefiltert',
    '🐛 PKR: Einsatz-Anzeige korrigiert (pkr zu FIAT_CURRENCIES ergänzt)',
  ],
  '1.0.72': [
    '🐛 Build-Fix: shieldOddsCache (unused param)',
  ],
  '1.0.71': [
    '🐛 Active Bets: Shield-angepasste Odds werden nun korrekt angezeigt (nicht mehr die Original-Quote)',
    '🐛 Shield-Odds werden persistiert – auch nach Refresh/Neustart sichtbar',
  ],
  '1.0.70': [
    '✨ Sport-Filter: Auswahl und Live/Upcoming-Toggle werden gespeichert (bleiben nach Neustart/Update erhalten)',
    '✨ AutoBet: Alle Einstellungen (Sport, GameType, Odds, Shield, Event-Filter, etc.) werden persistiert',
  ],
  '1.0.48': [
    '✨ NEW: Auto Cashout Options - Now works for confirmed bets too!',
    '✨ NEW: AutoBet - Enter bet amount in USD instead of Crypto',
    '🐛 FIXED: Cashout value calculation improved (real provider margin)',
    '🐛 FIXED: Starting Soon scan limit now works correctly',
  ],
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
