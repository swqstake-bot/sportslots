/**
 * Stake Bet-Share / Lookup-ID (wie in der UI oder beim Teilen).
 * Rohwerte aus GraphQL (houseBets `bet.id`): oft UUID ohne Prefix → `casino:c999b287-6775-…`
 * oder numerisch → `casino:123…`; bereits `casino:` / `house:` bleiben unverändert.
 */
export function formatStakeShareBetId(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (!s) return null
  if (/^(casino|house):/i.test(s)) return s
  // Reine Ziffern (Stake houseBets / RGS betId) — Share-Modal erwartet oft house:… wie GraphQL iid
  if (/^\d+$/.test(s)) return `house:${s}`
  return `casino:${s}`
}

/**
 * Nur Stake-„House“-Share-IDs (`houseBets.iid` / Top-Level `houseBets.id`).
 * `bet.id` (Union) ist oft die interne RGS-/Provider-ID (z. B. 527… statt 460…) — nicht für Links nutzen.
 * @param {{ shareIid?: string|null, houseTopId?: string|null }} payload — wie subscribeToBetUpdates
 * @returns {string|null} Rohwert für {@link formatStakeShareBetId}
 */
export function pickStakeHouseBetShareRawId(payload) {
  if (!payload) return null
  const si = payload.shareIid != null && String(payload.shareIid).trim() !== '' ? String(payload.shareIid).trim() : null
  if (si) return si
  const ht = payload.houseTopId != null && String(payload.houseTopId).trim() !== '' ? String(payload.houseTopId).trim() : null
  if (ht) return ht
  const top = payload.id != null && String(payload.id).trim() !== '' ? String(payload.id).trim() : null
  if (top && /^house:/i.test(top)) return top
  if (top && /^casino:[0-9a-f-]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(top)) return top
  return null
}

/**
 * Nur IDs aus dem Stake-**houseBets**-WebSocket (`shareIid` / `houseTopId` nach {@link formatStakeShareBetId})
 * in UI/localStorage — **keine** kurzen RGS-IDs (z. B. `house:527…` mit nur 9 Ziffern).
 * - `house:` + mind. 10 Ziffern (Stake nutzt u. a. 460…, Länge/Präfix können variieren)
 * - `casino:` + UUID
 */
export function isPersistableStakeHouseBetShareId(s) {
  if (s == null || typeof s !== 'string') return false
  const t = s.trim()
  if (!t) return false
  if (/^house:[0-9]{10,}$/.test(t)) return true
  if (/^casino:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true
  return false
}

/**
 * Stake REST `POST /bet/preview` — Request-Body `betId` ohne Prefix (reine UUID), vgl. OpenAPI-Beispiel.
 * Share-IDs (`casino:…` / `house:…`) werden auf den Kern gekürzt.
 */
export function stakeBetIdForPreviewApi(rawOrPrefixed) {
  if (rawOrPrefixed == null || rawOrPrefixed === '') return null
  const s = String(rawOrPrefixed).trim()
  if (!s) return null
  const m = /^(casino|house):(.+)$/i.exec(s)
  return (m ? m[2] : s).trim() || null
}

/**
 * Bet-Modal „Link teilen“ (Web): Query-Parameter `iid` = exakt derselbe Share-Identifier wie bei Stake
 * (GraphQL `houseBets.iid` — oft `house:460722689371`, kann auch `casino:uuid` sein). NICHT aus `bet.id`
 * ableiten und nicht `casino:` künstlich in `house:` drehen (siehe FRIDA `stakeBetWSObj.HouseBets.iid`).
 *
 * @param {string} shareIdentifier z. B. `house:460722689371` oder `casino:768a2e8d-…` (wie Copy-ID)
 */
export function stakeBetModalShareUrl(shareIdentifier, { origin = 'https://stake.bet' } = {}) {
  const iid = String(shareIdentifier || '').trim()
  if (!iid) return null
  const base = String(origin || 'https://stake.bet').replace(/\/$/, '')
  const params = new URLSearchParams({
    iid,
    modal: 'bet',
    source: 'link_shared',
  })
  return `${base}/casino/home?${params.toString()}`
}
