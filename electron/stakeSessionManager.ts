import { session } from 'electron';

const STAKE_ORIGINS = ['https://stake.com', 'https://stake.bet'] as const;
const RELEVANT_COOKIE_NAMES = ['session', 'cf_clearance', '__cf_bm'] as const;

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
  checkedAt: string;
  reasons: SessionRejectionReason[];
  missingCookies: string[];
  expiredCookies: string[];
  sessionToken: string | null;
  cookieHeader: string;
  userAgent: string;
  cookiesByName: Record<string, StakeCookieMeta>;
}

let lastStatus: StakeSessionStatus | null = null;
let lastCheckedAtMs = 0;
let inflightStatusPromise: Promise<StakeSessionStatus> | null = null;
const STATUS_CACHE_MS = 1000;
let lastLoggedStatusKey = '';
const LOG_VALID_SESSION_STATUS = false;

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

export async function resolveStakeOrigin(): Promise<string> {
  try {
    const hasCom = await hasValidSessionCookieForOrigin('https://stake.com');
    const hasBet = await hasValidSessionCookieForOrigin('https://stake.bet');
    if (hasBet && !hasCom) return 'https://stake.bet';
    return 'https://stake.com';
  } catch {
    return 'https://stake.com';
  }
}

function buildCookieHeader(cookies: Electron.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

function logSessionStatus(status: StakeSessionStatus): void {
  const statusKey = JSON.stringify({
    valid: status.valid,
    origin: status.origin,
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
      hasSessionCookie: Boolean(status.sessionToken),
      hasCfClearance: !status.missingCookies.includes('cf_clearance'),
      hasCfBm: !status.missingCookies.includes('__cf_bm'),
    });
    return;
  }

  console.warn('[StakeSession] Session rejected', {
    origin: status.origin,
    reasons: status.reasons,
    missingCookies: status.missingCookies,
    expiredCookies: status.expiredCookies,
  });
}

async function collectStatusInternal(): Promise<StakeSessionStatus> {
  const nowIso = new Date().toISOString();
  const origin = await resolveStakeOrigin();
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

  const status: StakeSessionStatus = {
    valid: reasons.length === 0,
    origin,
    checkedAt: nowIso,
    reasons,
    missingCookies,
    expiredCookies,
    sessionToken,
    cookieHeader,
    userAgent,
    cookiesByName,
  };

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
  return STAKE_ORIGINS.some((origin) => url.startsWith(origin));
}
