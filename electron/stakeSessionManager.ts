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
  com: StakeSiteStatusSummary;
  eu: StakeSiteStatusSummary;
}

let lastStatus: StakeSessionStatus | null = null;
let lastCheckedAtMs = 0;
let inflightStatusPromise: Promise<StakeSessionStatus> | null = null;
const STATUS_CACHE_MS = 1000;
let lastLoggedStatusKey = '';
const LOG_VALID_SESSION_STATUS = false;

let preferredSiteCache: StakePreferredSite | null = null;

function sitePrefsPath(): string {
  return path.join(app.getPath('userData'), 'stake-site.json');
}

function normalizePreferredSite(raw: unknown): StakePreferredSite {
  return String(raw || '').trim().toLowerCase() === 'eu' ? 'eu' : 'com';
}

export function getPreferredStakeSite(): StakePreferredSite {
  if (preferredSiteCache) return preferredSiteCache;
  try {
    const raw = fs.readFileSync(sitePrefsPath(), 'utf8');
    const parsed = JSON.parse(raw) as { site?: string };
    preferredSiteCache = normalizePreferredSite(parsed?.site);
  } catch {
    preferredSiteCache = 'com';
  }
  return preferredSiteCache;
}

export function setPreferredStakeSite(site: StakePreferredSite | string): StakePreferredSite {
  const next = normalizePreferredSite(site);
  preferredSiteCache = next;
  try {
    fs.writeFileSync(sitePrefsPath(), JSON.stringify({ site: next }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[StakeSession] Failed to persist preferred site', err);
  }
  invalidateStakeSessionStatusCache();
  return next;
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
  return STAKE_ORIGINS.some((origin) => url.startsWith(origin)) || /https?:\/\/([^/]*\.)?stake\.(com|bet|eu)\b/i.test(url);
}

export async function listStakeSiteStatuses(): Promise<StakeSiteStatuses> {
  const preferredSite = getPreferredStakeSite();
  const [comOrigin, hasCom, hasBet, hasEu] = await Promise.all([
    resolveClassicStakeOrigin(),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_COM),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_BET),
    hasValidSessionCookieForOrigin(STAKE_ORIGIN_EU),
  ]);
  const activeOrigin = await resolveStakeOrigin();
  return {
    preferredSite,
    activeOrigin,
    com: {
      site: 'com',
      origin: comOrigin,
      valid: hasCom || hasBet,
    },
    eu: {
      site: 'eu',
      origin: STAKE_ORIGIN_EU,
      valid: hasEu,
    },
  };
}
