/**
 * Parst eingefügte Telegram-/Stake-Texte: Casino-Game-URLs, Mindesteinsatz, Kurzinfos.
 */

const STAKE_GAME_URL =
  /https?:\/\/(?:www\.)?stake\.[a-z.]+\/casino\/games\/([a-zA-Z0-9-]+)/gi

/** Markdown-ähnlich: "Name (https://stake.../games/slug)" */
const MD_LINK_RE =
  /([^\n()]+?)\s*\(\s*(https?:\/\/(?:www\.)?stake\.[^)\s]+\/casino\/games\/([a-zA-Z0-9-]+))\s*\)/gi

function normalizeStakeGameSlug(slug) {
  const s = String(slug || '').toLowerCase().trim()
  if (!s) return s
  // Stake nennt die Mutation "casesBet", das Spiel im Hunter ist aber "packs".
  if (s === 'cases') return 'packs'
  return s
}

/** Ziel-Multiplikatoren (z. B. 100x, 50×, multiplier: 25) – typisch Challenge-Posts */
function extractTargetMultipliers(raw) {
  const s = String(raw || '')
  const nums = new Set()
  const patterns = [
    /\b(\d{1,6}(?:\.\d+)?)\s*[x×]\b/gi,
    /(?:multiplier|multi)\s*[:\s]+(\d{1,6}(?:\.\d+)?)/gi,
    /\b(\d{1,6}(?:\.\d+)?)\s*[x×]\s*(?:multi|multiplier|gewinn)?/gi,
    /(?:hit|reach)\s+(\d{1,6}(?:\.\d+)?)\s*[x×]/gi,
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(s)) !== null) {
      const n = parseFloat(m[1])
      if (Number.isFinite(n) && n >= 1 && n <= 1e6) nums.add(n)
    }
  }
  return [...nums].sort((a, b) => a - b)
}

/** z. B. "🏆 Game 1: Packs" → "Packs" */
function normalizeTelegramGameName(name, slug) {
  let n = String(name || '')
    .replace(/[*🎰⚡️🏆📅💰💵🚀🍀]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  n = n.replace(/^Game\s*\d+\s*:\s*/i, '').trim()
  return n || slugToDisplayName(slug)
}

function detectOriginalsChallenge(raw) {
  const s = String(raw || '')
  return (
    /\bOriginals\s+Challenge\b/i.test(s) ||
    /\bStake\s+Originals\b/i.test(s) ||
    /\bStake\s+Originals\s+games?\b/i.test(s) ||
    /\bdifferent\s+Stake\s+Originals\b/i.test(s)
  )
}

/** Kurzbeschreibung der Aufgabe (Legendary, Bet-ID, …) */
function extractOriginalsObjectiveHint(raw) {
  const lines = String(raw || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const clean = (line) => line.replace(/^\s*[-*•🏆📅💰]+\s*/, '').trim()
  for (const line of lines) {
    const t = clean(line)
    if (t.length < 12 || t.length > 400) continue
    if (/\bLegendary\b/i.test(t) || /\bEarn\s+\$/i.test(t) || /\bNo\.\s*\d+.*Legendary/i.test(t)) return t
  }
  for (const line of lines) {
    const t = clean(line)
    if (t.length < 12 || t.length > 400) continue
    if (
      /\b(?:Earn|Get|Hit|valid entry|bet ID|participants|post a)/i.test(t)
    ) {
      return t
    }
  }
  return null
}

function slugToDisplayName(slug) {
  if (!slug || typeof slug !== 'string') return slug
  const parts = slug.split('-').filter(Boolean)
  if (parts.length <= 1) return slug
  const skip = new Set([
    'pragmatic',
    'play',
    'pragmaticplay',
    'playngo',
    'hacksaw',
    'relax',
    '3oaks',
    '3oak',
    'netent',
    'btg',
    'nolimit',
    'push',
    'stake',
    'originals',
  ])
  const nameParts = []
  for (let i = parts.length - 1; i >= 0 && nameParts.length < 8; i--) {
    const p = parts[i]
    if (skip.has(p.toLowerCase()) && nameParts.length === 0) continue
    nameParts.unshift(p)
  }
  if (nameParts.length === 0) return slug
  return nameParts
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * @param {string} text
 * @returns {{
 *   games: { slug: string, name: string }[],
 *   minBetUsd: number | null,
 *   targetMultipliers: number[],
 *   durationHint: string | null,
 *   statusHint: string | null,
 *   prizeLines: string[],
 *   isOriginalsChallenge: boolean,
 *   originalsObjectiveHint: string | null,
 * }}
 */
export function parseTelegramStakeMessage(text) {
  const raw = String(text || '')
  const isOriginalsChallenge = detectOriginalsChallenge(raw)
  const originalsObjectiveHint = isOriginalsChallenge ? extractOriginalsObjectiveHint(raw) : null
  const targetMultipliers = extractTargetMultipliers(raw)
  const games = []
  const seen = new Set()

  let m
  const mdRe = new RegExp(MD_LINK_RE.source, MD_LINK_RE.flags)
  while ((m = mdRe.exec(raw)) !== null) {
    const slug = normalizeStakeGameSlug(m[3])
    const name = normalizeTelegramGameName(m[1], slug)
    if (slug && !seen.has(slug)) {
      seen.add(slug)
      games.push({ slug, name: name || slugToDisplayName(slug) })
    }
  }

  const bareRe = new RegExp(STAKE_GAME_URL.source, STAKE_GAME_URL.flags)
  while ((m = bareRe.exec(raw)) !== null) {
    const slug = normalizeStakeGameSlug(m[1])
    if (slug && !seen.has(slug)) {
      seen.add(slug)
      games.push({ slug, name: slugToDisplayName(slug) })
    }
  }

  // Zeile: "Game 2: Dice — https://stake.com/.../games/dice" (ohne Klammern um die URL)
  const gameLineUrl = /Game\s*\d+\s*:\s*[^\n]*?https?:\/\/(?:www\.)?stake\.[a-z.]+\/casino\/games\/([a-zA-Z0-9-]+)/gi
  while ((m = gameLineUrl.exec(raw)) !== null) {
    const slug = normalizeStakeGameSlug(m[1])
    if (slug && !seen.has(slug)) {
      seen.add(slug)
      games.push({ slug, name: slugToDisplayName(slug) })
    }
  }

  let minBetUsd = null
  const minPatterns = [
    /minimum\s+bet[^\n$]*\$?\s*([\d.,]+)\s*(?:USD|usd)?/i,
    /min\.?\s*bet[^\n$]*\$?\s*([\d.,]+)/i,
    /mindesteinsatz[^\n$]*\$?\s*([\d.,]+)/i,
    /\$\s*([\d.,]+)\s*USD/i,
    /bet\s+over\s+\$?\s*([\d.,]+)\s*USD/i,
  ]
  for (const re of minPatterns) {
    const x = raw.match(re)
    if (x) {
      const n = parseFloat(String(x[1]).replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0) {
        minBetUsd = n
        break
      }
    }
  }

  let durationHint = null
  const dur = raw.match(/(\d+)\s*minutes?/i)
  if (dur) durationHint = `${dur[1]} Min.`

  let statusHint = null
  if (/Status\s*:\s*Finished/i.test(raw)) statusHint = 'Beendet (laut Text)'
  else if (/challenge\s+has\s+begun|Challenge\s+hat\s+begonnen|has begun/i.test(raw)) statusHint = 'Läuft / gestartet'
  else if (/will begin in/i.test(raw)) statusHint = 'Start steht bevor'

  const prizeLines = []
  const prizeBlocks = raw.split(/\n/).filter((line) => /\$[\d,]+|prize|Prize|Gewinn|winners/i.test(line))
  for (const line of prizeBlocks.slice(0, 8)) {
    const t = line.replace(/^\s*[-*•]\s*/, '').trim()
    if (t.length > 8 && t.length < 280) prizeLines.push(t)
  }

  return {
    games,
    minBetUsd,
    targetMultipliers,
    durationHint,
    statusHint,
    prizeLines: prizeLines.slice(0, 6),
    isOriginalsChallenge,
    originalsObjectiveHint,
  }
}
