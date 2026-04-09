export const CHANGELOGS: Record<string, string[]> = {
  '1.0.128': ['promotion'],
  '1.0.127': ['promotion'],
  '1.0.126': ['promotion'],
  '1.0.125': ['promotion'],
  '1.0.124': ['promotion'],
  '1.0.123': ['promotion'],
  '1.0.122': ['promotion'],
  '1.0.113': ['themetest'],
  '1.0.103': ['challenge updated'],
  '1.0.91': [
    '🐛 Hacksaw: Autospin stoppt bei Insufficient Funds, Session timeout, Invalid seq',
    '🐛 Hand of Anubis: Bonus-Erkennung (judgment=4 Scatter, underworld=3 Scatter)',
    '✨ Slot-Statistik: Reset bei App-Start und beim Abwählen eines Slots',
  ],
  '1.0.90': [
    '🎨 Login: Stylisches Design, Username/Passwort, Anmeldedaten speichern',
  ],
  '1.0.89': [
    '🐛 Pragmatic/Rabbit Heist: Einsatz-Mapping, Bet-Levels (VND/IDR/ARS 100–52M), houseBets, Kontostand',
  ],
  '1.0.88': [
    '🐛 Fix: USD-Anzeige in Autospin-Labels (nicht mehr als Variable)',
  ],
  '1.0.87': [
    '✨ Slot-Statistik: Immer USD-Anzeige mit Wechselkurs-Umrechnung',
  ],
  '1.0.86': [
    '✨ Slot: BetList & Stats ausschließlich aus houseBets WebSocket',
    '✨ Slot: Kontostand/Session Δ aus balanceUpdated WebSocket (wie Wallet)',
  ],
  '1.0.83': [
    '✨ Forum-Scraper: casino→house Fix, REST Bet-Preview Fallback, alle Seiten durchsuchen',
    '✨ Forum: Top 30 Leaderboard, alle gefundenen Bets (nicht mehr 500 Limit), parallele Abfragen (3x)',
    '🎨 Global Controls: Kompakt inline in Slot-Sets-Zeile, aufklappbar für Apply First / Shared Currency',
  ],
  '1.0.82': [
    '🎨 App-Theme: AutoBet, Active Bets, BetSlip und RightSidebar auf --app-* Variablen umgestellt',
    '🎨 Fixture-Cards: Kompakteres Layout, kleinere Abstände',
    '🐛 Live-Badge: Nur bei echten Live-Spielen (matchStatus live/in_play), nicht bei Upcoming',
    '🎨 Bonus-Hunt-Chart: Überarbeitetes Design (Hintergrund, Grid, Farben, Legende)',
    '🎨 Slot-Icons: Größere Darstellung (42px)',
    '⚙️ TipMenu aus AutoBet-Bereich entfernt',
  ],
  '1.0.75': [
    '✨ Wallet: Balance-Updates per WebSocket (balanceUpdated) – Echtzeit statt Polling',
    '✨ Slot: Multiplikator in Bet-Statistik (parseBetResponse)',
    '✨ Slot: Game-Name-Slugs erweitert (Ali Baba, Aladdin, Ragnas Rock, etc.)',
    '✨ Slot: Provider-Aliase prag, bg für Pragmatic/Blueprint',
    '🐛 Hacksaw: Bonus-Erkennung für bonus_spin, pick ergänzt',
    '🐛 Pragmatic: fs_total für Bonus-Detection',
  ],
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
