import { app, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const STAKE_ORIGIN_COM = 'https://stake.com';
export const STAKE_ORIGIN_BET = 'https://stake.bet';
export const STAKE_ORIGIN_EU = 'https://stake.eu';

const STAKE_ORIGINS = [STAKE_ORIGIN_COM, STAKE_ORIGIN_BET, STAKE_ORIGIN_EU] as const;
const RELEVANT_COOKIE_NAMES = ['session', 'cf_clearance', '__cf_bm'] as const;

export type StakePreferredSite = 'com' | 'eu';

export type SessionRejectionReason =
  | 'no_session_cookie'
  | 'session_cookie_expired'
  | 'cookie_jar_unavailable';

export interface StakeCookieMeta {
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expirationDate?: number;
  expired: boolean;
}

export interface StakeSessionStatus {
  valid: boolean;
  origin: string;
  preferredSite: StakePreferredSite;
  checkedAt: string;
  reasons: SessionRejectionReason[];
  missingCookies: string[];
  expiredCookies: string[];
  sessionToken: string | null;
  cookieHeader: string;
  userAgent: string;
  cookiesByName: Record<string, StakeCookieMeta>;
}

export interface StakeSiteStatusSummary {
  site: StakePreferredSite;
  origin: string;
  valid: boolean;
}

export interface StakeSiteStatuses {
  preferredSite: StakePreferredSite;
  activeOrigin: string;
  mirror: string;
  mirrorOptions: StakeMirrorOptions;
  com: StakeSiteStatusSummary;
  eu: StakeSiteStatusSummary;
}

let lastStatus: StakeSessionStatus | null = null;
let lastCheckedAtMs = 0;
let inflightStatusPromise: Promise<StakeSessionStatus> | null = null;
const STATUS_CACHE_MS = 1000;
let lastLoggedStatusKey = '';
const LOG_VALID_SESSION_STATUS = false;

/** Mirror-Wert „auto“ = bisheriges Verhalten (stake.bet bevorzugt, sonst stake.com je nach Session-Cookie). */
export const STAKE_MIRROR_AUTO = 'auto';
/** Fest eingebaute Mirrors der Classic-Plattform; eigene Domains kommen als „custom“ dazu. */
export const STAKE_BUILTIN_MIRRORS = ['stake.com', 'stake.bet', 'stake3114.com'] as const;
const MAX_CUSTOM_MIRRORS = 20;

export interface StakeMirrorOptions {
  selected: string;
  builtin: string[];
  custom: string[];
}

interface StakePrefs {
  site: StakePreferredSite;
  mirror: string;
  customMirrors: string[];
}

let prefsCache: StakePrefs | null = null;

function sitePrefsPath(): string {
  return path.join(app.getPath('userData'), 'stake-site.json');
}

function normalizePreferredSite(raw: unknown): StakePreferredSite {
  return String(raw || '').trim().toLowerCase() === 'eu' ? 'eu' : 'com';
}

/** „https://Stake3114.com/x“ → „stake3114.com“; null = ungültig (stake.eu ist eine eigene Plattform, kein Mirror). */
export function normalizeMirrorHost(raw: unknown): string | null {
  let value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = (value.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!value || value.length > 253) return null;
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return null;
  if (value === 'stake.eu' || value.endsWith('.stake.eu')) return null;
  return value;
}

function readPrefs(): StakePrefs {
  if (prefsCache) return prefsCache;
  let parsed: { site?: unknown; mirror?: unknown; customMirrors?: unknown } = {};
  try {
    parsed = JSON.parse(fs.readFileSync(sitePrefsPath(), 'utf8')) ?? {};
  } catch {
    /* defaults */
  }
  const builtin = new Set<string>(STAKE_BUILTIN_MIRRORS);
  const custom: string[] = [];
  if (Array.isArray(parsed.customMirrors)) {
    for (const entry of parsed.customMirrors) {
      const host = normalizeMirrorHost(entry);
      if (host && !builtin.has(host) && !custom.includes(host) && custom.length < MAX_CUSTOM_MIRRORS) {
        custom.push(host);
      }
    }
  }
  const rawMirror = String(parsed.mirror ?? '').trim().toLowerCase();
  const mirrorHost = rawMirror === STAKE_MIRROR_AUTO ? null : normalizeMirrorHost(rawMirror);
  const mirror =
    mirrorHost && (builtin.has(mirrorHost) || custom.includes(mirrorHost)) ? mirrorHost : STAKE_MIRROR_AUTO;
  prefsCache = { site: normalizePreferredSite(parsed.site), mirror, customMirrors: custom };
  return prefsCache;
}

function writePrefs(next: StakePrefs): void {
  prefsCache = next;
  try {
    fs.writeFileSync(
      sitePrefsPath(),
      JSON.stringify({ site: next.site, mirror: next.mirror, customMirrors: next.customMirrors }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('[StakeSession] Failed to persist site preferences', err);
  }
  invalidateStakeSessionStatusCache();
}

export function getPreferredStakeSite(): StakePreferredSite {
  return readPrefs().site;
}

export function setPreferredStakeSite(site: StakePreferredSite | string): StakePreferredSite {
  const next = normalizePreferredSite(site);
  writePrefs({ ...readPrefs(), site: next });
  return next;
}

/** Aktiver Mirror der Classic-Plattform: „auto“ oder ein Hostname wie „stake3114.com“. */
export function getStakeMirror(): string {
  return readPrefs().mirror;
}

export function getStakeMirrorOptions(): StakeMirrorOptions {
  const prefs = readPrefs();
  return { selected: prefs.mirror, builtin: [...STAKE_BUILTIN_MIRRORS], custom: [...prefs.customMirrors] };
}

/** Mirror wählen: „auto“, ein eingebauter oder ein eigener Hostname (wird gespeichert). Wirft bei ungültigem Host. */
export function setStakeMirror(raw: unknown): string {
  const prefs = readPrefs();
  const wanted = String(raw ?? '').trim().toLowerCase();
  if (wanted === STAKE_MIRROR_AUTO) {
    writePrefs({ ...prefs, mirror: STAKE_MIRROR_AUTO });
    return STAKE_MIRROR_AUTO;
  }
  const host = normalizeMirrorHost(wanted);
  if (!host) throw new Error(`Invalid mirror domain: ${String(raw ?? '').slice(0, 80)}`);
  let custom = prefs.customMirrors;
  const isBuiltin = (STAKE_BUILTIN_MIRRORS as readonly string[]).includes(host);
  if (!isBuiltin && !custom.includes(host)) {
    if (custom.length >= MAX_CUSTOM_MIRRORS) throw new Error('Too many custom mirrors');
    custom = [...custom, host];
  }
  writePrefs({ ...prefs, mirror: host, customMirrors: custom });
  return host;
}

/** Eigenen Mirror aus der Liste löschen (fällt auf „auto“ zurück, wenn er aktiv war). */
export function removeCustomStakeMirror(raw: unknown): StakeMirrorOptions {
  const host = normalizeMirrorHost(raw);
  const prefs = readPrefs();
  if (!host || !prefs.customMirrors.includes(host)) return getStakeMirrorOptions();
  writePrefs({
    ...prefs,
    customMirrors: prefs.customMirrors.filter((entry) => entry !== host),
    mirror: prefs.mirror === host ? STAKE_MIRROR_AUTO : prefs.mirror,
  });
  return getStakeMirrorOptions();
}

function classicHostBases(): string[] {
  return [...new Set<string>(['stake.com', 'stake.bet', ...STAKE_BUILTIN_MIRRORS, ...readPrefs().customMirrors])];
}

function hostUnder(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

/** Hostname gehört zu stake.com/.bet/.eu oder einem bekannten Mirror (inkl. Subdomains). */
export function isStakeHostname(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/^\./, '');
  if (!host) return false;
  return [...classicHostBases(), 'stake.eu'].some((base) => hostUnder(host, base));
}

/** Cookie-Domain (evtl. mit führendem Punkt) gehört zur Classic-Plattform (.com/.bet/Mirror). */
export function isClassicStakeCookieDomain(domain: string): boolean {
  const host = String(domain || '').toLowerCase().replace(/^\./, '');
  if (!host) return false;
  return classicHostBases().some((base) => hostUnder(host, base));
}

/** Origins aller bekannten Classic-Hosts (z. B. zum Aufräumen von Cookies). */
export function knownClassicMirrorOrigins(): string[] {
  return classicHostBases().map((host) => `https://${host}`);
}

/** URL-Muster für webRequest-Filter (alle Stake-Hosts inkl. Mirrors und stake.eu). */
export function stakeUrlMatchPatterns(): string[] {
  return [...classicHostBases(), 'stake.eu'].flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
}

function isCookieExpired(cookie: Electron.Cookie): boolean {
  const exp = Number(cookie.expirationDate);
  if (!Number.isFinite(exp) || exp <= 0) return false; // session-cookie
  const nowSec = Date.now() / 1000;
  return exp <= nowSec;
}

function toCookieMeta(cookie: Electron.Cookie): StakeCookieMeta {
  return {
    name: cookie.name,
    domain: cookie.domain || '',
    path: cookie.path || '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: String(cookie.sameSite || 'unspecified'),
    expirationDate: Number.isFinite(Number(cookie.expirationDate))
      ? Number(cookie.expirationDate)
      : undefined,
    expired: isCookieExpired(cookie),
  };
}

async function hasValidSessionCookieForOrigin(origin: string): Promise<boolean> {
  const cookies = await session.defaultSession.cookies.get({ url: origin });
  const sessionCookie = cookies.find((c) => c.name === 'session');
  if (!sessionCookie) return false;
  return !isCookieExpired(sessionCookie) && String(sessionCookie.value || '').length > 0;
}

/** Classic (.com/.bet) origin resolution — prefer stake.bet when both present. */
async function resolveClassicStakeOrigin(): Promise<string> {
  const mirror = getStakeMirror();
  if (mirror !== STAKE_MIRROR_AUTO) return `https://${mirror}`;
  const hasCom = await hasValidSessionCookieForOrigin(STAKE_ORIGIN_COM);
  const hasBet = await hasValidSessionCookieForOrigin(STAKE_ORIGIN_BET);
  if (hasBet) return STAKE_ORIGIN_BET;
  if (hasCom) return STAKE_ORIGIN_COM;
  return STAKE_ORIGIN_COM;
}

export async function resolveStakeOrigin(): Promise<string> {
  try {
    const preferred = getPreferredStakeSite();
    if (preferred === 'eu') {
      const hasEu = await hasValidSessionCookieForOrigin(STAKE_ORIGIN_EU);
      if (hasEu) return STAKE_ORIGIN_EU;
      // Preferred EU but no session yet — still target EU for login/API until user switches back.
      return STAKE_ORIGIN_EU;
    }
    return await resolveClassicStakeOrigin();
  } catch {
    return getPreferredStakeSite() === 'eu' ? STAKE_ORIGIN_EU : STAKE_ORIGIN_COM;
  }
}

/** Login URL for the active preferred site (ignores missing cookies). */
export async function resolveStakeLoginOrigin(): Promise<string> {
  if (getPreferredStakeSite() === 'eu') return STAKE_ORIGIN_EU;
  return resolveClassicStakeOrigin();
}

function buildCookieHeader(cookies: Electron.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

function logSessionStatus(status: StakeSessionStatus): void {
  const statusKey = JSON.stringify({
    valid: status.valid,
    origin: status.origin,
    preferredSite: status.preferredSite,
    reasons: status.reasons,
    missingCookies: status.missingCookies,
    expiredCookies: status.expiredCookies,
    hasSessionCookie: Boolean(status.sessionToken),
  });
  if (statusKey === lastLoggedStatusKey) return;
  lastLoggedStatusKey = statusKey;

  if (status.valid) {
    if (!LOG_VALID_SESSION_STATUS) return;
    console.log('[StakeSession] Session valid', {
      origin: status.origin,
      preferredSite: status.preferredSite,
      hasSessionCookie: Boolean(status.sessionToken),
      hasCfClearance: !status.missingCookies.includes('cf_clearance'),
      hasCfBm: !status.missingCookies.includes('__cf_bm'),
    });
    return;
  }

  console.warn('[StakeSession] Session rejected', {
    origin: status.origin,
    preferredSite: status.preferredSite,
    reasons: status.reasons,
    missingCookies: status.missingCookies,
    expiredCookies: status.expiredCookies,
  });
}

async function collectStatusForOrigin(origin: string, preferredSite: StakePreferredSite): Promise<StakeSessionStatus> {
  const nowIso = new Date().toISOString();
  const userAgent = session.defaultSession.getUserAgent();
  const reasons: SessionRejectionReason[] = [];

  let cookies: Electron.Cookie[] = [];
  try {
    cookies = await session.defaultSession.cookies.get({ url: origin });
  } catch {
    reasons.push('cookie_jar_unavailable');
  }

  const byName = new Map<string, Electron.Cookie>();
  for (const cookie of cookies) {
    if (!byName.has(cookie.name)) byName.set(cookie.name, cookie);
  }

  const missingCookies: string[] = [];
  const expiredCookies: string[] = [];
  const cookiesByName: Record<string, StakeCookieMeta> = {};
  for (const key of RELEVANT_COOKIE_NAMES) {
    const cookie = byName.get(key);
    if (!cookie) {
      missingCookies.push(key);
      continue;
    }
    const meta = toCookieMeta(cookie);
    cookiesByName[key] = meta;
    if (meta.expired) expiredCookies.push(key);
  }

  const sessionCookie = byName.get('session');
  const sessionToken =
    sessionCookie && !isCookieExpired(sessionCookie) && String(sessionCookie.value || '').length > 0
      ? sessionCookie.value
      : null;
  const cookieHeader = buildCookieHeader(cookies);

  if (!sessionCookie) reasons.push('no_session_cookie');
  if (sessionCookie && isCookieExpired(sessionCookie)) reasons.push('session_cookie_expired');

  return {
    valid: reasons.length === 0,
    origin,
    preferredSite,
    checkedAt: nowIso,
    reasons,
    missingCookies,
    expiredCookies,
    sessionToken,
    cookieHeader,
    userAgent,
    cookiesByName,
  };
}

async function collectStatusInternal(): Promise<StakeSessionStatus> {
  const preferredSite = getPreferredStakeSite();
  const origin = await resolveStakeOrigin();
  const status = await collectStatusForOrigin(origin, preferredSite);
  logSessionStatus(status);
  return status;
}

export async function getStakeSessionStatus(force = false): Promise<StakeSessionStatus> {
  const now = Date.now();
  if (!force && lastStatus && now - lastCheckedAtMs < STATUS_CACHE_MS) {
    return lastStatus;
  }
  if (!force && inflightStatusPromise) return inflightStatusPromise;

  inflightStatusPromise = collectStatusInternal()
    .then((status) => {
      lastStatus = status;
      lastCheckedAtMs = Date.now();
      return status;
    })
    .finally(() => {
      inflightStatusPromise = null;
    });
  return inflightStatusPromise;
}

export async function ensureValidStakeSession(force = false): Promise<StakeSessionStatus> {
  return getStakeSessionStatus(force);
}

export function invalidateStakeSessionStatusCache(): void {
  lastStatus = null;
  lastCheckedAtMs = 0;
}

export function isStakeOriginUrl(url: string): boolean {
  if (STAKE_ORIGINS.some((origin) => url.startsWith(origin))) return true;
  try {
    return isStakeHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function listStakeSiteStatuses(): Promise<StakeSiteStatuses> {
  const preferredSite = getPreferredStakeSite();
  const mirror = getStakeMirror();
  const [comOrigin, hasCom, hasBet, hasEu, hasMirror] = await Promise.all([
    resolveClassicStakeOrigin(),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_COM),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_BET),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_EU),
    mirror === STAKE_MIRROR_AUTO ? Promise.resolve(false) : hasValidSessionCookieForOrigin(`https://${mirror}`),
  ]);
  const activeOrigin = await resolveStakeOrigin();
  return {
    preferredSite,
    activeOrigin,
    mirror,
    mirrorOptions: getStakeMirrorOptions(),
    com: {
      site: 'com',
      origin: comOrigin,
      valid: mirror === STAKE_MIRROR_AUTO ? hasCom || hasBet : hasMirror,
    },
    eu: {
      site: 'eu',
      origin: STAKE_ORIGIN_EU,
      valid: hasEu,
    },
  };
}
