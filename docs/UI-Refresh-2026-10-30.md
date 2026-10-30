# Workspace UI refresh — 30 October 2026

The app now uses one persistent workspace shell: a collapsible navigation rail,
a shared account/connection header, a session status panel, an overview and a
central Settings page. Existing betting engines, provider integrations and
financial calculations remain in their existing modules.

## Follow-up for version 1.0.321

The Hunter's Filters & presets panel now sits directly below its main controls,
above discovery results, queue and monitoring. It is expanded on first visit and
shows three clear entry points: Presets & Filters, Local Challenge, and Runtime &
Limits. Each keeps its existing inputs and handlers. The toolbar shortcut opens
and scrolls to this panel, including after it was collapsed. Narrow windows stack
the three sections vertically.

The existing Sports selection reset now occurs in the tab-change event, preserving
same-tab selections and removing a failing lint effect. Release/update workflows
explicitly stop if either lint or the QA gate fails. Package and lockfile versions
are synchronized at 1.0.321 for the existing dual-repository update feed.

The isolated release-source export passed full lint (zero errors), compilation
and all 26 tests. Fourteen focused checks passed against its production bundles,
including 1024/1280/1366/1600-pixel layouts, Live feed, keyboard access, retained
settings and Sports selection reset. A separate AST comparison retained all 23
fields and 77 handler bindings; only the intended settings shortcut changed.

## Backup and local build

- Full pre-change project snapshot: `../StakeSportsElectron-v1.0.140-backup-20261030-095208`.
- Snapshot contains 70,099 files / 4,973,316,835 bytes, including uncommitted and
  untracked files, Git metadata, dependencies and previous build outputs.
- Robocopy comparison found no missing/different files. SHA-256 comparison also
  verified all 386 source/Electron files and the package/configuration files
  selected for verification. Snapshot verification metadata is saved beside the
  backup as `.manifest.json`.
- Local Windows build: `release/ui-refresh-20261030/win-unpacked/swqbot.exe`.
  Keep the complete `win-unpacked` directory together. This build has not been
  installed over the existing app or published to the update channel.

## Preserved feature map

- Casino: Slots, Originals, Bonus Hunt and API diagnostics. Local navigation
  shows the relevant game or challenge group; the global sidebar always exposes
  the other workspaces.
- Slots: multiple instances, per-instance controls, all start/stop controls,
  favorites, slot-set save/load/import/export/delete, shared wallet/game
  currencies, crypto filtering, additional settings and bet/statistics views.
  A new Focus / All slots switch opens a card overview automatically for multiple
  instances unless the user has chosen another view. Cards show stable instance
  numbers, the actual reported state and currencies, configured bet, session
  counters and recent results. Pending bonus results remain pending; bounded
  history fallbacks are explicitly labeled. Open controls and the existing
  per-instance stop handler target the exact instance. Switching views never
  remounts the underlying slot controls or starts a session.
- Originals: all 23 currently playable catalog entries, Automatic, Dice
  Conditions, legacy Dice Runner, Code/Script Builder, profiles, game settings,
  stop rules, Turbo compatibility, GC panel on EU, wallet controls, logs and
  floating/docked statistics. Existing user positioning is retained.
- Challenges: Hunter, Balance rules, History, compact/full views, live feed,
  notifications, presets, filters, queue and parallel controls.
  Hunter now separates discovery, queue processing and setup, with a distinct
  run-control row and Find / Queue / Monitor sections. Existing scan, queue,
  filter, probe, runtime, export, Tip, statistics and compact-mode handlers stay
  in place. The virtualized result list retains its original data/ref logic.
- Promotions: Casino, Forum on supported platforms and the explicitly enabled
  Telegram hunter. Navigation alone does not enable Telegram.
- Sports: all eight listed AutoBet strategies, event/sport/tournament selection,
  odds and leg filters, keywords, dates, profiles, fill-up/cover modes, props,
  MMA presets, Shield/strict/protected-leg controls, Copy feed/filter/stake modes,
  active bets and activity. Existing start/stop confirmation behavior remains.
- Account tools: .com/.eu switch, connection checks, refresh, wallet operations,
  account/VIP information, accent presets/brightness/strength and cache reset.
- Import analysis: shared JSONL import/export entry points for Casino and Sports,
  existing per-view filters and CSV exports. Imported data remains in memory when
  changing workspaces; it is not a new permanent background recording service.

## State and lifecycle

Visited workspaces remain mounted when changing navigation. Casino itself stays
at one React position; Slots, Originals, Bonus Hunt, Hunter, Balance rules and
the visited Telegram panel retain their local runtime state. Explicit disable,
stop, reset and removal actions retain their existing meaning. Original engine
managers remain outside the view switch.

The global session store is display-only and is not persisted. It does not call
start, stop, pause, wagering or cashout APIs. Existing engines publish state;
Slots link back to their exact instance, and Balance/Telegram links select the
correct local tab even on first visit. Waiting states do not expire simply
because no new bet occurred. Hunter failures remain available for review.

AutoBet stake values are explicitly shown as USD and distinguished from wallet
currency. Fill-up is not described as respecting a regular bet-count target.
Code sessions display the currency captured at their actual start.

UI storage now has an explicit migration version. Previous casino/sports/logger
destinations, existing accent choices and legacy settings are preserved. Sidebar
collapse, display density and an optional Overview startup preference are saved.

The second review also corrected clipped promotion descriptions, overly small
tournament and active-bet controls, an unnecessary outer activity scrollbar,
the Color menu's Escape behavior and focus return from Originals settings.
Import/export failures show a recoverable message and retain already loaded
data. The overview reads the selected wallet balance from existing app state.

## Validation

- `npm run build:compile`: application TypeScript, production frontend and
  Electron TypeScript completed successfully.
- `npm run qa:gate`: monetary-contract fixtures, replay fixtures and 26 tests
  passed (including five new status-routing/failure regressions).
- ESLint on all new/modified TypeScript source: no errors. Only the two existing
  CasinoView dependency warnings remain; betting callbacks were not rewritten
  merely to silence them.
- Sports AST comparison against the snapshot retained every pre-existing
  configuration handler, input/select binding and option value. Sports UI checks
  exercised profiles, USD/currency distinction, fill-up, advanced filters, Shield
  and all Copy stake modes.
- Casino parity checks retained session, slot-set, currency and start/stop
  handlers. All playable Originals and advanced modes were opened. Base Casino
  CSS, existing Originals CSS and provider/slot-constant files remain identical
  to the snapshot.
- Isolated browser checks covered global navigation, menu focus/Escape, data
  retention, .eu availability, stored preferences, first-visit links and DOM
  instance retention. Layout checks included 1280/1366/1600-pixel windows and
  additional narrower widths. 125% scaling was simulated through equivalent
  effective CSS viewport widths.
- An independent review identified exact-slot routing, failed Hunter state and
  Code start-currency reporting; all three were corrected.
- A second inventory compared 447 original interactive JSX elements from the
  changed existing components with the snapshot and traced relocated controls.
  No original source file was removed and no lost entry point was found.
- Multi-slot checks cover automatic overview selection, remembered explicit
  views, repeated-game instance numbers, 2/3/6-card layouts, preserved control
  instances, repeated focus requests and removal. Display fixtures verify
  session totals versus retained history and pending/missing-result semantics.
  Configured bets match the existing Focus formatter on .com and .eu.
- The Hunter presentation pass preserves all 196 original relevant handler,
  control, ref, key and run-card bindings. Dense discovery results, filters,
  tools, queue/run monitoring and compact mode are checked without executing a
  run.
- The final production smoke passed all eight checks against the built frontend
  (`index-CJEYCn7P.js` / `index-Qdb53YOn.css`), without development source imports.
  It covered settings, Sports, Multi-slot/Focus, Hunter, import and state retention.
  No engine action, mutation or browser error was observed. The four final
  `ui-refresh-*.png` previews were captured from this production build.
- The packaged Windows app was verified against all 34 compiled frontend and
  Electron files by SHA-256. The package entry point and version match the
  project; source, temporary files, Git metadata and `.env` are excluded.

Browser validation used a fresh context with fake Electron responses and blocked
external HTTP/WebSocket traffic. No real login, wager or cashout was performed.
Existing provider startup/probing behavior was not changed by this UI work.
Actual provider connectivity and financial execution were not tested.

Detailed local browser reports are under `tmp/ux-qa`; Casino visual/parity reports
are under the task's temporary `stakes-casino-qa` directory. They are development
evidence, not production application data.
