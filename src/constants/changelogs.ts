export const CHANGELOGS: Record<string, string[]> = {
  '1.0.188': [
    '✨ Originals: neues Workbench-UI (Dashboard, Automatic, Manual, Conditions, Turbo, flexible Layout/Stats)',
    '✨ Originals: B2B-Reinvest + Take-Profit, Combo, Pause/Resume, Vault-Deposit, erweiterte Stops & IF/THEN-Conditions',
    '✨ Originals: Plinko Expert 10.000×, Profit-Chart mit Fläche, Session-Stats (RTP, B2B-Streak)',
    '⚡ Originals Turbo: parallele Bets mit Rate-Limit-Backoff (B2B/Combo automatisch Normal-Modus)',
    '🐛 Originals: Bet-IDs via betApiId↔houseBets + myBetUpdated-WS-Fallback',
    '🐛 Originals: B2B-Streak/Win-Erkennung und Stop-Engine korrigiert',
    '🐛 Slots: KPI-Drift behoben — deduplizierte Bet-History, kein Autospin-Doppelzählen, WS Multi-Key-Dedup',
    '✨ Header: VIP/Wagered/Weekly-Wager Meta (Account-Query)',
  ],
  '1.0.187': [
    '✨ Challenge Hunter: StakeCruncher-Schwierigkeit (Lookup-Table, Badge, Sortierung, Analyze)',
    '✨ Challenge Hunter: Found-Liste — Sortierung nach Target-Multi, RGS-Slug ohne Publisher-Präfix',
    '✨ Telegram Hunter: Multi-Slot-Posts per StakeCruncher ranken (beste Trefferchance zuerst in Queue)',
    '🐛 StakeCruncher: Referer + Rate-Limit-Queue, Katalog-Match (Twist z. B. 25_97), Pocket/Donut-Prefix',
    '🐛 Script/Originals: houseBets Bet-ID-Matching vereinfacht (FIFO, nur eigene Wetten)',
  ],
  '1.0.186': [
    '🐛 Script/Originals: Bet-IDs wieder zuverlässig — frühes houseBets-Pending, Retry-Puffer, lockeres Match (Betrag Spiel/Währung)',
    '🐛 Script/Originals: casino:uuid Share-IDs in der Bet-Liste anzeigen (nicht nur house:…)',
  ],
  '1.0.185': [
    '🐛 Script/Originals: Bet-Liste — korrekte Multi (Stake payoutMultiplier), Bet-IDs auch bei Wins (houseBets-Match)',
    '🐛 Script/Originals: Session-Statistik (Wagered, Profit, Max×) auf tatsächlichem API-Einsatz statt internem USD-Ziel',
  ],
  '1.0.184': [
    '🐛 Challenge Hunter: Stake ChallengeList an Web-API angeglichen (Sort startAt/prize/wager/multiplier, direction, groupIds) — kein HTTP 400 mehr durch ungültige Sorts',
    '✨ Challenge Hunter: immer Vollscan (alle Seiten, Multi-Sort-Merge) — Slider „Pages to Load“ entfernt, ~1460+ Challenges sichtbar',
  ],
  '1.0.183': [
    '✨ Challenge Hunter: alle 15s Claimed-Check (Stake all-claimed, Seite 1) — stoppt laufende Runs automatisch wenn jemand anderes gewonnen hat, auch ohne Scan/Autorun',
  ],
  '1.0.182': [
    '✨ Dice Runner: Hunt → Moonshot — kleine Hunt-Spins bis Ziel-Multi, dann 1× Wette mit vollem Gewinn auf End-Multi (z. B. 9900×)',
    '🐛 Dice Runner: Moonshot-Verlust beendet Session nicht mehr fälschlich — Hunt läuft weiter; Jackpot nur bei echtem End-Multi-Treffer',
  ],
  '1.0.181': [
    '⚡ Playnetic: sb (set-bet) nur bei Einsatzwechsel — Autospin ~1 HTTP-Roundtrip schneller pro Spin',
    '⚡ Autospin: weniger UI-Re-Renders und Logging-Overhead während schneller Serien',
  ],
  '1.0.180': [
    '🐛 Slot-Statistik: placeBet-Dedup blockierte Spins (Playnetic `n` nicht eindeutig) — alle Spins sofort sichtbar',
    '🐛 houseBets-Reconcile: FIFO ohne strikten Betrag (PowerBet 15c vs Stake 10c), Einsatz aus placeBet behalten',
  ],
  '1.0.179': [
    '✨ Playnetic (Farmageddon): Hub88 gs/g API, gsplauncher-Auflösung, PowerBet 1.5× (10c→15c)',
    '🐛 Playnetic: Spin-Header (Referer+ss-wid) – leere states-Response behoben',
    '🐛 Playnetic: ss-sid nach jedem Spin hochzählen (2. Spin „Illegal SID“)',
    '🐛 SlotControl: houseBets-Match für Playnetic/Hub88 (Slug-Tail + Spielname)',
    '✨ Drittanbieter-Slots: Sofort-Statistik aus placeBet, houseBets reconciled per FIFO (kein 1.4s-Delay)',
  ],
  '1.0.178': [
    '🐛 Script-Chart: Endlosschleife (Too many re-renders) behoben',
    '🐛 CI: ESLint Chart-Domain + ungenutzte Logger-Helfer',
  ],
  '1.0.177': [
    '🐛 Pragmatic Sexy Rabbit (Big Duck Bonanza): vsrar-Linien, cver 421122, v3 gameService',
    '✨ Casino: Bet-Listen nur Session (Start/Schließen leeren IndexedDB + UI)',
    '✨ Script: Limbo B2B-Preset, Session-Stats, house:-Bet-IDs, Chart/Stats-Layout',
    '🐛 Script: B2B-Multi = Produkt der Win-Multis, Round-Profit in Bet-Liste',
  ],
  '1.0.176': [
    '🐛 Challenge Hunter: houseBets-iid direkt auf Run/Lifetime (ohne Pending-Match-Zwang)',
    '🐛 Bet-ID-Match: USD/USDC/USDT gleichwertig, High-Multi bei vielen Spins',
    '🐛 ThirdPartyBet: payoutMultiplier in houseBets-Subscription',
    '🐛 Run-Card: Bet ID record zeigt auch Run-bestBetId',
  ],
  '1.0.175': [
    '🐛 Hacksaw Challenge Hunter: Bonus wird durchgespielt (Continue/Drain statt Timeout-Abbruch)',
    '🐛 Hacksaw: Gewinn/Multi nach feature_exit und Balance-Delta (wie Bonus Hunt)',
    '🐛 Hacksaw: Continue-Retry bei Timeout, Keep-Alive vor Spins',
  ],
  '1.0.172': [
    '🐛 Dice Runner: Auto rerun stops on target hit (no restart after win)',
    '🎨 Dice Runner: removed helper/description text from UI',
  ],
  '1.0.171': [
    '🐛 Dice Runner: Win chance stays the same for Roll Over / Roll Under (display fix)',
  ],
  '1.0.170': [
    '✨ Originals: Dice Runner — flat USD bets, target multiplier, roll over/under',
    '✨ Dice Runner: optional seed rotation (every N spins / on target hit)',
    '✨ Dice Runner: Auto rerun — polls wallet and restarts when balance is back',
    '✨ Dice Runner: all currencies, spins/sec throttle, profit chart & bet log',
  ],
  '1.0.152': [
    '🐛 Stats: Wagered/Payout/Profit stabilisiert (HouseBets/HTTP-Reconcile + stärkeres Dedup)',
    '🐛 Stats: KPI-Summen aus USD-Snapshots statt nachträglicher FX-Neubewertung',
    '✨ Realtime: HouseBets-Parsing robuster (Batch-Payloads + dedup auf iid/id/betId)',
  ],
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
