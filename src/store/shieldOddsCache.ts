/**
 * Cache für Shield-angepasste Odds pro Bet-ID.
 * Stake liefert adjustments.payoutMultiplier oft nicht – wir speichern die Odds,
 * die wir bei Platzerstellung kennen (stakeShieldOfferOdds).
 */
const STORAGE_KEY = 'slotbot_shield_odds_cache';

let cache: Record<string, number> = {};

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) {}
  return {};
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (_) {}
}

export function getShieldOdds(betId: string): number | undefined {
  if (!cache || Object.keys(cache).length === 0) cache = load();
  return cache[betId];
}

export function setShieldOdds(betId: string, payoutMultiplier: number) {
  if (!cache || Object.keys(cache).length === 0) cache = load();
  cache[betId] = payoutMultiplier;
  save();
}

/** Alte Einträge entfernen (z.B. > 7 Tage) – optional, bei Bedarf erweiterbar */
export function pruneOlderThan(_ms: number) {
  // Aktuell: keine Timestamps gespeichert – Cache behalten
}
