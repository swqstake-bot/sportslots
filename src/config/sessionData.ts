/**
 * Hub feed and highlights are session-only (in-memory).
 * Logger no longer records in the background — export hub session JSONL and import in Logger tab if needed.
 */
export const SESSION_ONLY_HUB_AND_LOGGER = true

/**
 * Casino (Play, Hub, Originals, Script): Bet-Listen nur für die laufende App-Session.
 * IndexedDB/localStorage-Bet-History wird beim Start geleert und beim Schließen nicht behalten.
 */
export const SESSION_ONLY_CASINO_BETS = true

/** @deprecated Alias — bitte SESSION_ONLY_CASINO_BETS verwenden */
export const SESSION_ONLY_SCRIPT_BETS = SESSION_ONLY_CASINO_BETS
