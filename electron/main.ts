import { app, BrowserWindow, ipcMain, net, session, shell, globalShortcut, dialog, Tray, Menu, nativeImage, type WebContents } from 'electron';
// electron-updater ist CommonJS: Named Import `import { autoUpdater }` bricht unter ESM (Main-Prozess).
import updaterModule from 'electron-updater';
const { autoUpdater } = updaterModule;
import logger from 'electron-log';
import https from 'node:https';
import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';
import os from 'os';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import {
  DIST,
  VITE_PUBLIC,
  SPIN_SAMPLES_DIR,
  FIRST_SLOT_WINS_DIR,
  VITE_DEV_SERVER_URL,
  ELECTRON_DIR,
  REPO_ROOT,
} from './config.js';
import { finalizeStakebotxBridge, resolveStakebotxBridgeSync } from './stakebotxBridge.js';
import type { StakebotxRendererBridgeInfo } from './stakebotxBridgeTypes.js';
import { sessionData, captureSession } from './sessionCapture.js';
import {
  ensureValidStakeSession,
  getPreferredStakeSite,
  getStakeSessionStatus,
  invalidateStakeSessionStatusCache,
  isStakeOriginUrl,
  listStakeSiteStatuses,
  resolveStakeLoginOrigin,
  resolveStakeOrigin,
  setPreferredStakeSite,
  STAKE_ORIGIN_BET,
  STAKE_ORIGIN_COM,
  STAKE_ORIGIN_EU,
  type StakePreferredSite,
  type StakeSessionStatus,
} from './stakeSessionManager.js';
import {
  STAKE_BROWSER_USER_AGENT,
  applyDefaultSessionUserAgent,
  applyStakeBrowserUserAgent,
  configureStakeBrowserUserAgent,
  stakeClientHintHeaders,
} from './stakeBrowserChrome.js';
import { destroyEuTurnstileWindow, solveEuTopUpTurnstile } from './euTurnstile.js';

configureStakeBrowserUserAgent();

// NOTE: do NOT use app.commandLine.appendSwitch('disable-http2') here —
// it kills HTTP/2 app-wide including Cloudflare/Stake login windows.
// The updater now uses a generic (latest.yml) feed which avoids the
// GitHub API rate limit; HTTP/2 CDN errors are handled by retry logic.

function extractStakeJsonErrorMessage(parsed: unknown): string {
    if (parsed == null) return 'Leere Antwort';
    if (typeof parsed === 'string') return parsed.slice(0, 500);
    if (typeof parsed !== 'object') return String(parsed);
    const o = parsed as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string' && o.error) return o.error;
    if (o.error && typeof o.error === 'object' && o.error !== null && 'message' in (o.error as object)) {
        const m = (o.error as { message?: string }).message;
        if (typeof m === 'string' && m) return m;
    }
    if (Array.isArray(o.errors) && o.errors[0] && typeof o.errors[0] === 'object' && o.errors[0] !== null) {
        const m = (o.errors[0] as { message?: string }).message;
        if (typeof m === 'string' && m) return m;
    }
    if (typeof o.detail === 'string' && o.detail) return o.detail;
    try {
        return JSON.stringify(parsed).slice(0, 400);
    } catch {
        return 'HTTP-Fehler';
    }
}
import {
  telegramLogin,
  submitAuthCode,
  submitAuthPassword,
  telegramStatus,
  telegramFetchChannelMessages,
  telegramLogout,
  telegramStartListen,
  telegramStopListen,
  shutdownTelegramForAppQuit,
  loadTelegramConfig,
  saveTelegramConfig,
} from './telegramUser.js';

let win: BrowserWindow | null;
let loginWin: BrowserWindow | null;
let stakeLoginPromise: Promise<void> | null = null;
let stakeBridgeWin: BrowserWindow | null = null;
let withdrawPrefillWin: BrowserWindow | null = null;
let forumLoginWin: BrowserWindow | null = null;
/** Hidden BrowserWindow reused for forum scrapes (Appeals Monitor createSessionFetcher pattern). */
let forumScrapeWin: BrowserWindow | null = null;
let forumChallengeWin: BrowserWindow | null = null;
let forumChallengeInFlight: Promise<boolean> | null = null;
let slotPopupSeq = 0;

/** Stake Community forum (IPS) – same pattern as Appeals Monitor: isolated partition + BrowserWindow loadURL. */
const FORUM_ORIGIN = 'https://stakecommunity.com';
const FORUM_SESSION_PARTITION = 'persist:stakecommunity-forum';

function forumDefaultFetchHeaders(referer: string): Record<string, string> {
  const ref = referer && referer.startsWith('http') ? referer : `${FORUM_ORIGIN}/`;
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
    Referer: ref,
    Origin: FORUM_ORIGIN,
    DNT: '1',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  };
}

function isCloudflareChallengeHtml(html: string): boolean {
  const h = String(html || '').toLowerCase();
  if (!h) return false;
  return (
    h.includes('<title>just a moment...</title>') ||
    h.includes('just a moment...') ||
    h.includes('cf-browser-verification') ||
    h.includes('cf-challenge') ||
    h.includes('challenge-platform') ||
    (h.includes('cdn-cgi/challenge-platform') && h.includes('cloudflare'))
  );
}

type StakeLoginWindowOptions = {
  /** After 403/CF: keep the window open until GraphQL from this window succeeds — do not close on a leftover session cookie. */
  requireLiveApi?: boolean;
};

/** True when the login window can reach Stake GraphQL (not a Cloudflare HTML 403). */
async function stakeLoginWindowApiReady(win: BrowserWindow | null, origin: string): Promise<boolean> {
  if (!win || win.isDestroyed()) return false;
  const url = `${String(origin || '').replace(/\/$/, '')}/_api/graphql`;
  const script = `
    (async () => {
      try {
        const res = await fetch(${JSON.stringify(url)}, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            accept: '*/*',
            'x-operation-name': 'SessionProbe',
            'x-operation-type': 'query',
          },
          body: JSON.stringify({ query: 'query SessionProbe { user { id } }', variables: {} }),
        });
        const text = await res.text();
        return { status: res.status, body: text.slice(0, 400) };
      } catch (e) {
        return { status: 0, body: String(e && e.message ? e.message : e) };
      }
    })();
  `;
  try {
    const result = (await win.webContents.executeJavaScript(script, true)) as {
      status?: number;
      body?: string;
    };
    const status = Number(result?.status || 0);
    const body = String(result?.body || '');
    if (status !== 200) return false;
    if (isCloudflareChallengeHtml(body)) return false;
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function ensureForumScrapeWindow(): BrowserWindow {
  if (forumScrapeWin && !forumScrapeWin.isDestroyed()) return forumScrapeWin;
  forumScrapeWin = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: FORUM_SESSION_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  forumScrapeWin.on('closed', () => {
    forumScrapeWin = null;
  });
  return forumScrapeWin;
}

function recycleForumScrapeWindow() {
  const w = forumScrapeWin;
  forumScrapeWin = null;
  if (!w || w.isDestroyed()) return;
  try {
    w.webContents.stop();
  } catch {
    /* ignore */
  }
  try {
    w.destroy();
  } catch {
    /* ignore */
  }
}

/** One hidden window can only load one URL at a time; queue overlapping IPC fetches. */
let forumScrapeTail: Promise<void> = Promise.resolve();

function enqueueForumScrape<T>(fn: () => Promise<T>): Promise<T> {
  const run = forumScrapeTail.then(fn, fn);
  forumScrapeTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function waitForForumContentOrCf(w: BrowserWindow): Promise<void> {
  return w.webContents
    .executeJavaScript(`
      new Promise((res) => {
        const isCf = () => {
          const t = (document.title || '').toLowerCase();
          return t.includes('just a moment')
            || !!document.querySelector('#challenge-form, .cf-browser-verification, #cf-challenge-running, #challenge-body-text');
        };
        const hasTopic = () => !!document.querySelector(
          '[data-role="commentContent"], .cPost_contentWrap, #comments .ipsComment_content, article.ipsComment, .ipsType_pageTitle'
        );
        const hasBoard = () => !!document.querySelector('a[href*="/board/"], a[href*="/topic/"]');
        const looksRss = () => /<(rss|rdf:RDF|feed|item|entry)[\\s>]/i.test(document.documentElement.outerHTML);
        if (hasTopic() || hasBoard() || looksRss()) return res('ok');
        if (isCf()) {
          const start = Date.now();
          const checkCf = () => {
            if (hasTopic() || hasBoard() || looksRss()) return res('ok');
            if (!isCf()) return res('passed');
            if (Date.now() - start > 14000) return res('cf');
            setTimeout(checkCf, 250);
          };
          return checkCf();
        }
        const start = Date.now();
        const check = () => {
          if (hasTopic() || hasBoard() || looksRss()) return res('ok');
          if (isCf()) return res('cf');
          if (Date.now() - start > 6000) return res('timeout');
          setTimeout(check, 150);
        };
        check();
      });
    `)
    .then(() => undefined, () => undefined);
}

/**
 * Load a forum URL in the shared Chromium session (cookies + TLS fingerprint).
 * session.fetch / Node https cannot pass Cloudflare JS challenges — this can.
 */
function loadForumUrlInScrapeWindow(url: string): Promise<{ html: string; finalUrl: string }> {
  return enqueueForumScrape(async () => {
    const w = ensureForumScrapeWindow();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Forum page load timeout')), 45000);
    });
    const load = (async () => {
      await w.loadURL(url);
      if (w.isDestroyed()) throw new Error('Forum scrape window closed');
      await waitForForumContentOrCf(w);
    })();
    try {
      await Promise.race([load, timedOut]);
      if (w.isDestroyed()) throw new Error('Forum scrape window closed');
      const html = String((await w.webContents.executeJavaScript('document.documentElement.outerHTML')) ?? '');
      return { html, finalUrl: w.webContents.getURL() || url };
    } catch (err) {
      recycleForumScrapeWindow();
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      void load.catch(() => undefined);
    }
  });
}

/** Visible window so the user (or Chromium) can complete Cloudflare / login. */
function openForumCloudflareChallenge(startUrl?: string): Promise<boolean> {
  if (forumChallengeInFlight) return forumChallengeInFlight;
  forumChallengeInFlight = new Promise<boolean>((resolve) => {
    if (forumChallengeWin && !forumChallengeWin.isDestroyed()) {
      forumChallengeWin.focus();
    } else {
      forumChallengeWin = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'Stake Community – Cloudflare / login',
        webPreferences: {
          partition: FORUM_SESSION_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      forumChallengeWin.on('closed', () => {
        forumChallengeWin = null;
      });
    }
    const target = startUrl && startUrl.startsWith('http') ? startUrl : `${FORUM_ORIGIN}/`;
    void forumChallengeWin.loadURL(target);

    const ses = session.fromPartition(FORUM_SESSION_PARTITION);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (forumChallengeWin && !forumChallengeWin.isDestroyed()) {
        try {
          forumChallengeWin.close();
        } catch {
          /* ignore */
        }
      }
      resolve(ok);
    };

    const poll = setInterval(async () => {
      try {
        const cookies = await ses.cookies.get({ url: FORUM_ORIGIN });
        const hasCf = cookies.some(
          (c) => c.name === 'cf_clearance' || c.name === '__cf_bm' || c.name.startsWith('cf_')
        );
        if (!forumChallengeWin || forumChallengeWin.isDestroyed()) {
          finish(hasCf || cookies.length > 0);
          return;
        }
        let title = '';
        try {
          title = String((await forumChallengeWin.webContents.executeJavaScript('document.title')) || '');
        } catch {
          /* ignore */
        }
        const stillCf = title.toLowerCase().includes('just a moment');
        if (!stillCf && title && (hasCf || cookies.length > 0)) {
          clearInterval(poll);
          setTimeout(() => finish(true), 2000);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 1000);

    forumChallengeWin.once('closed', () => {
      void (async () => {
        try {
          const cookies = await ses.cookies.get({ url: FORUM_ORIGIN });
          const hasCf = cookies.some((c) => c.name === 'cf_clearance' || c.name.startsWith('cf_'));
          finish(hasCf || cookies.length > 0);
        } catch {
          finish(false);
        }
      })();
    });

    setTimeout(() => finish(false), 120000);
  }).finally(() => {
    forumChallengeInFlight = null;
  });
  return forumChallengeInFlight;
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function openExternalSafe(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) {
    throw new Error('External URL scheme is not allowed');
  }
  await shell.openExternal(url);
}

function isAllowedForumPath(pathname: string): boolean {
  const path = String(pathname || '');
  return path.includes('/topic/') || path.includes('/board/') || /\.xml\/?$/i.test(path);
}

function isAllowedForumFetchUrl(raw: string): boolean {
  try {
    const parsed = new URL(String(raw || '').trim());
    if (!hostnameMatches(parsed.hostname, 'stakecommunity.com')) return false;
    return isAllowedForumPath(parsed.pathname);
  } catch {
    return false;
  }
}

function hostnameMatches(hostname: string, allowed: string): boolean {
  const host = hostname.toLowerCase();
  const needle = allowed.toLowerCase();
  if (!needle) return false;
  if (needle.includes('.')) return host === needle || host.endsWith(`.${needle}`);
  return host.split('.').some((part) => part.includes(needle));
}

/** Pragmatic / Fat Panda / Sexy Rabbit gs2c hosts (Stake liefert rotierende CDN-Subdomains). */
const PRAGMATIC_HOST_SUFFIXES = [
  'gcmlgxrmkp.net',
  'ukffjfmmka.net',
  'iumtibif.net',
  /** Stake.eu social / XSWP (HAR stakeeuspiele.har) */
  'xtsbzfybyl.net',
] as const;

function isPragmaticProxyTarget(hostname: string, pathname: string): boolean {
  if (!hostname) return false;
  if (PRAGMATIC_HOST_SUFFIXES.some((suffix) => hostnameMatches(hostname, suffix))) return true;
  // playGame.do auf stake.com läuft über rgs — nicht als Pragmatic-CDN behandeln
  if (
    hostnameMatches(hostname, 'stake.com') ||
    hostnameMatches(hostname, 'stake.bet') ||
    hostnameMatches(hostname, 'stake.eu') ||
    hostnameMatches(hostname, 'stake-engine.com') ||
    hostnameMatches(hostname, 'engine.io')
  ) {
    return false;
  }
  const path = (pathname || '').toLowerCase();
  return path.includes('/gs2c/') || path.includes('playgame.do') || path.includes('html5game.do');
}

/**
 * Verstecktes Stake-Bridge-Fenster hat kein `parent` — bleibt sonst offen, blockiert `window-all-closed`
 * und hält den Electron-Prozess am Leben (Windows/Linux).
 */
function destroyAuxiliaryBrowserWindows(): void {
  if (stakeBridgeWin && !stakeBridgeWin.isDestroyed()) {
    try {
      stakeBridgeWin.destroy();
    } catch {
      /* ignore */
    }
    stakeBridgeWin = null;
  }
  if (loginWin && !loginWin.isDestroyed()) {
    try {
      loginWin.destroy();
    } catch {
      /* ignore */
    }
    loginWin = null;
  }
  if (withdrawPrefillWin && !withdrawPrefillWin.isDestroyed()) {
    try {
      withdrawPrefillWin.destroy();
    } catch {
      /* ignore */
    }
    withdrawPrefillWin = null;
  }
  if (forumScrapeWin && !forumScrapeWin.isDestroyed()) {
    try {
      forumScrapeWin.destroy();
    } catch {
      /* ignore */
    }
    forumScrapeWin = null;
  }
  if (forumChallengeWin && !forumChallengeWin.isDestroyed()) {
    try {
      forumChallengeWin.destroy();
    } catch {
      /* ignore */
    }
    forumChallengeWin = null;
  }
  if (forumLoginWin && !forumLoginWin.isDestroyed()) {
    try {
      forumLoginWin.destroy();
    } catch {
      /* ignore */
    }
    forumLoginWin = null;
  }
  destroyEuTurnstileWindow();
}

/**
 * Fills Stake cashier withdrawal address field (Svelte/React) via native value setter + events.
 * Retries because the wallet modal mounts after first paint / SPA route.
 */
async function fillStakeWithdrawAddressField(webContents: WebContents, address: string): Promise<boolean> {
  const addrJson = JSON.stringify(address);
  const script = `(function() {
    var el = document.querySelector('textarea[data-testid="withdrawal-address"]')
      || document.querySelector('textarea[name="address"]');
    if (!el) return false;
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${addrJson});
    } catch (e) {
      el.value = ${addrJson};
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    try { el.focus(); } catch (_) {}
    return true;
  })()`;

  for (let i = 0; i < 80; i++) {
    try {
      if (webContents.isDestroyed()) return false;
      const done = (await webContents.executeJavaScript(script, true)) as boolean;
      if (done) return true;
    } catch {
      return false;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return false;
}
const MAX_IPC_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB safety cap for IPC responses
const STAKE_MAX_AUTH_RETRIES = 2;
const STAKE_COOKIE_DEBUG_NAMES = new Set(['session', 'cf_clearance', '__cf_bm']);
let lastLoginWindowOpenAt = 0;
const LOGIN_WINDOW_DEBOUNCE_MS = 4000;
let lastNet403FallbackLogAt = 0;
const NET_403_FALLBACK_LOG_DEBOUNCE_MS = 15000;
const PROXY_HTTP_AGENT = new http.Agent({
  keepAlive: true,
  maxSockets: 96,
  maxFreeSockets: 16,
  timeout: 60000,
})
const PROXY_HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 96,
  maxFreeSockets: 16,
  timeout: 60000,
})

/** Short-lived cache so multiple React mounts do not hammer localhost probes. */
let stakebotxBridgeCache: { at: number; payload: StakebotxRendererBridgeInfo } | null = null;
const STAKEBOTX_BRIDGE_CACHE_MS = 2000;

class StakeHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function throwIfSessionInvalid(sessionStatus: StakeSessionStatus): void {
  if (sessionStatus.valid && sessionStatus.sessionToken) return;
  const missingText = sessionStatus.missingCookies.length
    ? ` missing=${sessionStatus.missingCookies.join(',')}`
    : '';
  const expiredText = sessionStatus.expiredCookies.length
    ? ` expired=${sessionStatus.expiredCookies.join(',')}`
    : '';
  throw new Error(`Session rejected.${missingText}${expiredText}`.trim());
}

function openLoginWindowForRejectedSession(reason: string): void {
  const now = Date.now();
  if (loginWin && !loginWin.isDestroyed()) {
    try {
      loginWin.show();
      loginWin.focus();
    } catch {
      /* ignore */
    }
    return;
  }
  if (now - lastLoginWindowOpenAt < LOGIN_WINDOW_DEBOUNCE_MS) {
    return;
  }
  lastLoginWindowOpenAt = now;
  console.warn('[StakeSession] Opening login window due to rejected session:', reason);
  void openStakeLoginWindow(undefined, { requireLiveApi: true }).catch((err) => {
    console.error('[StakeSession] Login window failed:', err);
  });
}

async function ensureStakeBridgeWindow(origin: string): Promise<BrowserWindow> {
  const target = String(origin || '').replace(/\/$/, '');
  if (stakeBridgeWin && !stakeBridgeWin.isDestroyed()) {
    try {
      const current = stakeBridgeWin.webContents.getURL();
      if (current.startsWith(target)) {
        return stakeBridgeWin;
      }
    } catch {
      /* recreate below */
    }
    try {
      stakeBridgeWin.destroy();
    } catch {
      /* ignore */
    }
    stakeBridgeWin = null;
  }
  stakeBridgeWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  await stakeBridgeWin.loadURL(`${target}/`);
  return stakeBridgeWin;
}

async function stakeBrowserPostJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<{ status: number; body: string; parsed: unknown }> {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  const w = await ensureStakeBridgeWindow(origin);
  const script = `
    (async () => {
      const res = await fetch(${JSON.stringify(url)}, {
        method: 'POST',
        credentials: 'include',
        headers: ${JSON.stringify(headers)},
        body: ${JSON.stringify(JSON.stringify(payload))}
      });
      const text = await res.text();
      return { status: res.status, body: text };
    })();
  `;
  const result = (await w.webContents.executeJavaScript(script, true)) as {
    status: number;
    body: string;
  };
  const status = Number(result?.status || 0);
  const body = String(result?.body || '');
  if (status === 401 || status === 403) {
    throw new StakeHttpError(status, body, `Session rejected (${status})`);
  }
  if (status === 429) {
    throw new StakeHttpError(status, body, 'API rate limited (429). Bitte kurz warten und erneut versuchen.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new StakeHttpError(status, body, `API antwortete nicht mit JSON (HTTP ${status}).`);
  }
  if (status >= 400) {
    throw new StakeHttpError(status, body, `HTTP ${status}: ${extractStakeJsonErrorMessage(parsed)}`);
  }
  return { status, body, parsed };
}

async function stakeBrowserGetText(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string; finalUrl: string }> {
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  const w = await ensureStakeBridgeWindow(origin);
  const script = `
    (async () => {
      const res = await fetch(${JSON.stringify(url)}, {
        method: 'GET',
        credentials: 'include',
        headers: ${JSON.stringify(headers)}
      });
      const text = await res.text();
      return { status: res.status, body: text, finalUrl: res.url };
    })();
  `;
  const result = (await w.webContents.executeJavaScript(script, true)) as {
    status: number;
    body: string;
    finalUrl: string;
  };
  return {
    status: Number(result?.status || 0),
    body: String(result?.body || ''),
    finalUrl: String(result?.finalUrl || url),
  };
}

async function stakeNetPostJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<{ status: number; body: string; parsed: unknown }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (value: { status: number; body: string; parsed: unknown }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = net.request({ method: 'POST', url, useSessionCookies: true });
    for (const [name, value] of Object.entries(headers)) {
      request.setHeader(name, value);
    }

    request.on('response', (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let abortedForSize = false;
      response.on('data', (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > MAX_IPC_RESPONSE_BYTES) {
          abortedForSize = true;
          request.abort();
          return;
        }
        chunks.push(buf);
      });
      response.on('end', () => {
        if (abortedForSize) {
          settleReject(new Error(`API response too large (> ${MAX_IPC_RESPONSE_BYTES} bytes).`));
          return;
        }
        const body = Buffer.concat(chunks).toString();
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 403) {
          settleReject(new StakeHttpError(status, body, `Session rejected (${status})`));
          return;
        }
        if (status === 429) {
          settleReject(new StakeHttpError(status, body, 'API rate limited (429). Bitte kurz warten und erneut versuchen.'));
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          settleReject(new StakeHttpError(status, body, `API antwortete nicht mit JSON (HTTP ${status}).`));
          return;
        }
        if (status >= 400) {
          settleReject(
            new StakeHttpError(status, body, `HTTP ${status}: ${extractStakeJsonErrorMessage(parsed)}`)
          );
          return;
        }
        settleResolve({ status, body, parsed });
      });
      response.on('error', (error) => {
        // Electron net stack can emit stream-level ECONNRESET (SimpleURLLoaderWrapper).
        // Treat as request failure instead of bubbling as uncaught main-process exception.
        settleReject(error);
      });
    });

    request.on('error', (error) => {
      settleReject(error);
    });

    request.write(JSON.stringify(payload));
    request.end();
  });
}

function getBetLogsDir(): string {
  const dir = path.join(app.getPath('userData'), 'bet-logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Session-only logger: wipe JSONL house-bet logs when the app exits (export first if needed). */
function clearAllBetLogs(): void {
  try {
    const dir = getBetLogsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(dir, file));
      } catch {
        // ignore per-file errors
      }
    }
    logger.info('[Logger] Cleared session bet logs on quit');
  } catch (e) {
    logger.warn('[Logger] clearAllBetLogs failed:', e);
  }
}

const LOGGER_CURRENCY_CONFIG_QUERY = `query CurrencyConfiguration($isAcp: Boolean!) {
  currencyConfiguration(isAcp: $isAcp) {
    baseRates { currency baseRate }
  }
}`;

const APP_DISPLAY_NAME = 'swqbot';
const FRAMELESS_CHROME = process.platform === 'win32' || process.platform === 'linux';
const WINDOW_BACKGROUND = '#0f212e';

let tray: Tray | null = null;

function registerWindowChromeIpc(): void {
  ipcMain.handle('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
    return true;
  });
  ipcMain.handle('window-maximize', () => {
    const focused = BrowserWindow.getFocusedWindow();
    if (!focused) return false;
    if (focused.isMaximized()) focused.unmaximize();
    else focused.maximize();
    return focused.isMaximized();
  });
  ipcMain.handle('window-close', () => {
    BrowserWindow.getFocusedWindow()?.close();
    return true;
  });
  ipcMain.handle('window-is-maximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false);
}

function applyFramelessChromeOptions(): Pick<Electron.BrowserWindowConstructorOptions, 'frame' | 'backgroundColor'> {
  if (!FRAMELESS_CHROME) {
    return {};
  }
  return {
    frame: false,
    backgroundColor: WINDOW_BACKGROUND,
  };
}

function resolveAppIconPath(kind: 'window' | 'tray'): string {
  const trayPng = path.join(VITE_PUBLIC, 'tray-icon.png');
  const iconPng = path.join(VITE_PUBLIC, 'icon.png');
  const iconSvg = path.join(VITE_PUBLIC, 'favicon.svg');
  if (kind === 'tray' && fs.existsSync(trayPng)) return trayPng;
  if (fs.existsSync(iconPng)) return iconPng;
  return iconSvg;
}

function createTray(): void {
  if (tray) return;
  const iconPath = resolveAppIconPath('tray');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  const trayImage = image.resize({ width: 16, height: 16 });
  tray = new Tray(trayImage);
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Show ${APP_DISPLAY_NAME}`,
        click: () => {
          win?.show();
          win?.focus();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('double-click', () => {
    win?.show();
    win?.focus();
  });
}

function createWindow() {
  const resolvedIconPath = resolveAppIconPath('window');

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_DISPLAY_NAME,
    autoHideMenuBar: true,
    icon: resolvedIconPath,
    ...applyFramelessChromeOptions(),
    webPreferences: {
      preload: path.join(ELECTRON_DIR, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
      /** Sports/Casino AutoBet nutzt setTimeout-Loops — Standard wäre Throttling bei minimiertem Fenster. */
      backgroundThrottling: false,
    },
  });

  applyStakeBrowserUserAgent(win.webContents);

  /** Gepackte App: keine DevTools (RAM/UX); nur unfertige Builds aus dem Repo. */
  const allowDevTools = !app.isPackaged;

  console.log('Loading URL:', VITE_DEV_SERVER_URL);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    if (allowDevTools) {
      win.webContents.openDevTools();
    }
    win.webContents.session.clearCache().then(() => {
        console.log('Cache cleared!');
    });
  } else {
    // Production
    win.loadFile(path.join(DIST, 'index.html'));
  }

  if (allowDevTools) {
    const toggleDevTools = () => {
      win?.webContents.toggleDevTools();
    };
    globalShortcut.register('F12', toggleDevTools);
    globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
  }

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed!', details.reason);
  });

  win.webContents.on('unresponsive', () => {
    console.error('Renderer process is unresponsive!');
  });

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url).catch((err) => console.warn('Blocked external URL:', err?.message || err));
    return { action: 'deny' };
  });

  win.on('close', () => {
    destroyAuxiliaryBrowserWindows();
  });
  win.on('closed', () => {
    win = null;
  });
}

async function openStakeLoginWindow(
  explicitOrigin?: string,
  options?: StakeLoginWindowOptions
): Promise<void> {
  const requireLiveApi = options?.requireLiveApi === true;
  const stakeUrl = String(explicitOrigin || '').trim() || (await resolveStakeLoginOrigin());
  const stakeOriginBase = stakeUrl.replace(/\/$/, '');

  // Same-origin window already open → focus and wait for that login flow.
  if (loginWin && !loginWin.isDestroyed()) {
    try {
      const current = loginWin.webContents.getURL();
      if (current.startsWith(stakeOriginBase)) {
        loginWin.focus();
        if (stakeLoginPromise) await stakeLoginPromise;
        return;
      }
    } catch {
      /* recreate below */
    }
    // Different site (com ↔ eu): close previous login and continue.
    try {
      loginWin.destroy();
    } catch {
      /* ignore */
    }
    loginWin = null;
    if (stakeLoginPromise) {
      try {
        await stakeLoginPromise;
      } catch {
        /* ignore */
      }
    }
  } else if (stakeLoginPromise) {
    try {
      await stakeLoginPromise;
    } catch {
      /* ignore */
    }
    // After waiting, another caller may have opened the target site already.
    if (loginWin && !loginWin.isDestroyed()) {
      try {
        if (loginWin.webContents.getURL().startsWith(stakeOriginBase)) {
          loginWin.focus();
          return;
        }
      } catch {
        /* recreate below */
      }
    }
  }

  if (stakeLoginPromise) {
    try {
      await stakeLoginPromise;
    } catch {
      /* ignore */
    }
    return openStakeLoginWindow(stakeUrl, options);
  }

  stakeLoginPromise = new Promise<void>((resolve) => {
    void (async () => {
      const ses = session.defaultSession;

      const isEu = /stake\.eu/i.test(stakeUrl);
      loginWin = new BrowserWindow({
        width: 1000,
        height: 720,
        autoHideMenuBar: true,
        title: requireLiveApi
          ? isEu
            ? 'Stake.eu – Cloudflare / sign in (window stays until API works)'
            : 'Stake – Cloudflare / sign in (window stays until API works)'
          : isEu
            ? 'Stake.eu – sign in'
            : 'Stake – sign in',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
        },
      });

      applyStakeBrowserUserAgent(loginWin.webContents);
      void loginWin.loadURL(stakeUrl, { userAgent: STAKE_BROWSER_USER_AGENT });

      let settled = false;
      const finish = async (closeWindow: boolean) => {
        if (settled) return;
        settled = true;
        clearInterval(pollTimer);
        ses.cookies.removeListener('changed', onCookieChanged);
        invalidateStakeSessionStatusCache();
        await captureSession();
        try {
          if (loginWin && !loginWin.isDestroyed()) {
            const pageUa = await loginWin.webContents.executeJavaScript('navigator.userAgent', true);
            if (typeof pageUa === 'string' && pageUa && !pageUa.toLowerCase().includes('electron')) {
              sessionData.userAgent = pageUa;
              ses.setUserAgent(pageUa);
            }
          }
        } catch {
          /* ignore */
        }
        if (closeWindow && loginWin && !loginWin.isDestroyed()) {
          loginWin.close();
        }
        resolve();
      };

      const loginOrigin = (() => {
        try {
          return new URL(stakeUrl).origin;
        } catch {
          return stakeOriginBase;
        }
      })();

      /** Nur Session-Cookie der Login-Origin zählt — Titel „Stake“ allein schließt sonst .eu sofort (wenn .com schon da ist). */
      const isStakeLoggedIn = async (): Promise<boolean> => {
        try {
          const cookies = await ses.cookies.get({ url: loginOrigin });
          const sessionCookie = cookies.find((c) => c.name === 'session');
          if (!sessionCookie || !String(sessionCookie.value || '').length) return false;
          const exp = Number(sessionCookie.expirationDate);
          if (Number.isFinite(exp) && exp > 0 && exp <= Date.now() / 1000) return false;
          return true;
        } catch {
          return false;
        }
      };

      const sessionCookieMatchesLoginSite = (cookie: Electron.Cookie): boolean => {
        const domain = String(cookie.domain || '').toLowerCase();
        if (isEu) return domain.includes('stake.eu');
        return domain.includes('stake.com') || domain.includes('stake.bet');
      };

      const tryFinishIfReady = async () => {
        if (settled) return;
        if (!(await isStakeLoggedIn())) return;
        if (requireLiveApi) {
          const apiOk = await stakeLoginWindowApiReady(loginWin, loginOrigin);
          if (!apiOk) return;
        }
        await finish(true);
      };

      const pollTimer = setInterval(() => {
        void tryFinishIfReady();
      }, requireLiveApi ? 2000 : 1000);

      const onCookieChanged = (
        _event: Electron.Event,
        cookie: Electron.Cookie,
        _cause: string,
        removed: boolean
      ) => {
        if (cookie.name === 'cf_clearance' && !removed && sessionCookieMatchesLoginSite(cookie)) {
          void captureSession();
          if (requireLiveApi) void tryFinishIfReady();
        }
        if (cookie.name === 'session' && !removed && sessionCookieMatchesLoginSite(cookie)) {
          void tryFinishIfReady();
        }
      };
      ses.cookies.on('changed', onCookieChanged);

      loginWin.on('closed', () => {
        loginWin = null;
        void finish(false);
      });

      loginWin.webContents.on('did-finish-load', () => {
        void captureSession();
      });
    })();
  });

  try {
    await stakeLoginPromise;
  } finally {
    stakeLoginPromise = null;
  }
}

// --- Auto Updater (electron-updater / GitHub Releases + latest.yml) ---
/**
 * Muss zum primären Eintrag in package.json → build.publish passen.
 * Feed = öffentliches Releases-only-Repo (nicht Source). Migration: siehe docs/auto-update-feed.md
 */
const UPDATER_GITHUB = { owner: 'swqstake-bot', repo: 'sportslots-releases' } as const;
/** Direct latest.yml — avoids GitHub API (60 req/h unauthenticated → HTTP 429). */
const UPDATER_GENERIC_FEED = `https://github.com/${UPDATER_GITHUB.owner}/${UPDATER_GITHUB.repo}/releases/latest/download/` as const;
/** Keep in sync with src/config/sessionData.ts (SESSION_ONLY_CASINO_BETS) — legacy JSONL cleared on start + quit. */
const SESSION_ONLY_BET_LOGS = true;

const UPDATER_MAX_TRANSIENT_RETRIES = 3;
const UPDATER_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000;
const UPDATER_TRANSIENT_NET_RE =
  /ERR_HTTP2_|ERR_CONNECTION_|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Empty reply|content-security-policy|<!doctype html|<html[\s>]|text\/html|blob\.core\.windows\.net|github\.githubassets\.com/i;
const UPDATER_RATE_LIMIT_RE = /\b429\b|rate.?limit|too many requests/i;

let updaterTransientRetries = 0;
let updaterRetryTimer: ReturnType<typeof setTimeout> | null = null;

function isRateLimitUpdaterError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return UPDATER_RATE_LIMIT_RE.test(msg);
}

function isTransientUpdaterError(err: unknown): boolean {
  if (isRateLimitUpdaterError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return UPDATER_TRANSIENT_NET_RE.test(msg);
}

function formatUpdaterError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'Unknown update error');
  if (isRateLimitUpdaterError(err)) {
    return 'GitHub rate limit (HTTP 429). Automatic retry in 15 minutes — no need to reinstall.';
  }
  const netErr = msg.match(/net::ERR_[A-Z0-9_]+/i)?.[0];
  if (netErr) {
    return `${netErr} — GitHub CDN/network glitch. Retry, or install from the releases page.`;
  }
  const htmlOrCsp =
    /content-security-policy|<!doctype html|<html[\s>]|text\/html|blob\.core\.windows\.net|github\.githubassets\.com/i.test(
      msg
    ) || msg.length > 500;
  if (htmlOrCsp) {
    const status = msg.match(/\b(403|404|429|500|502|503)\b/)?.[1];
    const hint = status ? `HTTP ${status}` : 'HTML/CSP error page';
    return `GitHub returned ${hint} instead of latest.yml. Retry, or reinstall from the releases page.`;
  }
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

function clearUpdaterRetryTimer(): void {
  if (updaterRetryTimer) {
    clearTimeout(updaterRetryTimer);
    updaterRetryTimer = null;
  }
}

function resetUpdaterTransientRetries(): void {
  updaterTransientRetries = 0;
  clearUpdaterRetryTimer();
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configureGithubAutoUpdater(): void {
  if (!app.isPackaged) return;
  try {
    // Generic file feed (latest.yml) — GitHub provider hits api.github.com and 429s easily.
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: UPDATER_GENERIC_FEED,
    });
    logger.info('[Updater] generic feed:', UPDATER_GENERIC_FEED);
  } catch (e) {
    logger.warn('[Updater] setFeedURL failed:', e);
  }
}

async function checkForUpdatesWithRetry(maxAttempts = UPDATER_MAX_TRANSIENT_RETRIES): Promise<Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>> {
  configureGithubAutoUpdater();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await autoUpdater.checkForUpdates();
      resetUpdaterTransientRetries();
      return result;
    } catch (e) {
      lastErr = e;
      if (isRateLimitUpdaterError(e)) break;
      if (!isTransientUpdaterError(e) || attempt === maxAttempts) break;
      const delay = Math.min(8000, 1000 * 2 ** (attempt - 1));
      logger.warn(
        `[Updater] transient check error (attempt ${attempt}/${maxAttempts}), retry in ${delay}ms:`,
        e instanceof Error ? e.message : e
      );
      await sleepMs(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'Update check failed'));
}

function scheduleTransientUpdaterRetry(err: Error): boolean {
  if (!isTransientUpdaterError(err) || updaterTransientRetries >= UPDATER_MAX_TRANSIENT_RETRIES) {
    return false;
  }
  updaterTransientRetries += 1;
  const delay = isRateLimitUpdaterError(err)
    ? UPDATER_RATE_LIMIT_BACKOFF_MS
    : Math.min(8000, 1000 * 2 ** (updaterTransientRetries - 1));
  logger.warn(
    `[Updater] transient error event (retry ${updaterTransientRetries}/${UPDATER_MAX_TRANSIENT_RETRIES}) in ${delay}ms:`,
    err.message
  );
  clearUpdaterRetryTimer();
  updaterRetryTimer = setTimeout(() => {
    updaterRetryTimer = null;
    checkForUpdatesWithRetry(1).catch((e) => logger.error('[Updater] retry check failed:', e));
  }, delay);
  return true;
}

// Production: Update im Hintergrund laden; Installation weiterhin über „Neustart“ (oder Quit).
autoUpdater.autoDownload = app.isPackaged;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = logger;
(autoUpdater.logger as any).transports.file.level = 'info';
autoUpdater.allowDowngrade = false;
// GitHub Releases rejects multi-range differential downloads (501) → avoid that path.
autoUpdater.disableDifferentialDownload = true;

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...');
  logger.info('[Updater] Checking for update...');
  win?.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  resetUpdaterTransientRetries();
  console.log('[Updater] Update available:', info);
  logger.info('[Updater] Update available:', info);
  win?.webContents.send('update-status', { status: 'available', info });
});

autoUpdater.on('update-not-available', (info) => {
  resetUpdaterTransientRetries();
  console.log('[Updater] Update not available:', info);
  logger.info('[Updater] Update not available:', info);
  win?.webContents.send('update-status', { status: 'not-available', info });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error:', err);
  logger.error('[Updater] Error:', err);
  if (scheduleTransientUpdaterRetry(err)) {
    win?.webContents.send('update-status', {
      status: isRateLimitUpdaterError(err) ? 'rate-limited' : 'checking',
      error: isRateLimitUpdaterError(err) ? formatUpdaterError(err) : undefined,
    });
    return;
  }
  resetUpdaterTransientRetries();
  win?.webContents.send('update-status', { status: 'error', error: formatUpdaterError(err) });
});

autoUpdater.on('download-progress', (progressObj) => {
  win?.webContents.send('update-status', { status: 'downloading', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
  resetUpdaterTransientRetries();
  console.log('[Updater] Update downloaded:', info);
  win?.webContents.send('update-status', { status: 'downloaded', info });
});

ipcMain.handle('get-app-version', () => app.getVersion());

/**
 * StakeBot-X renderer bridge: resolves a safe mount URL (loopback http(s) or verified static index.html)
 * and optionally probes http(s) targets. Legacy UI remains the default when nothing is reachable.
 */
ipcMain.handle(
  'stakebotx-renderer-bridge',
  async (_event, options?: { refresh?: boolean; probe?: boolean }) => {
    const refresh = options?.refresh === true;
    const shouldProbe = options?.probe !== false;
    const now = Date.now();
    if (!refresh && stakebotxBridgeCache && now - stakebotxBridgeCache.at < STAKEBOTX_BRIDGE_CACHE_MS) {
      return stakebotxBridgeCache.payload;
    }
    const sync = resolveStakebotxBridgeSync({
      repoRoot: REPO_ROOT,
      isPackaged: app.isPackaged,
      env: process.env,
    });
    const info = await finalizeStakebotxBridge(sync, { probe: shouldProbe, env: process.env });
    stakebotxBridgeCache = { at: Date.now(), payload: info };
    return info;
  }
);

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    console.log('[Updater] Skipping check in dev mode');
    return { skipped: true as const };
  }
  try {
    const result = await checkForUpdatesWithRetry();
    return { skipped: false as const, result };
  } catch (e) {
    logger.error('[Updater] checkForUpdates:', e);
    if (isRateLimitUpdaterError(e)) {
      scheduleTransientUpdaterRetry(e instanceof Error ? e : new Error(String(e)));
      win?.webContents.send('update-status', {
        status: 'rate-limited',
        error: formatUpdaterError(e),
      });
      return { skipped: false as const, rateLimited: true as const };
    }
    win?.webContents.send('update-status', {
      status: 'error',
      error: formatUpdaterError(e),
    });
    throw e;
  }
});

ipcMain.handle('start-download', () => {
    resetUpdaterTransientRetries();
    autoUpdater.downloadUpdate().catch((e) => {
      logger.error('[Updater] downloadUpdate:', e);
      win?.webContents.send('update-status', {
        status: 'error',
        error: formatUpdaterError(e),
      });
    });
});

ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});
// --------------------------

// IPC Handlers
ipcMain.handle('login', async (_event, payload?: { site?: StakePreferredSite; origin?: string }) => {
    const site = payload?.site;
    if (site === 'com' || site === 'eu') {
      setPreferredStakeSite(site);
    }
    const origin =
      String(payload?.origin || '').trim() ||
      (site === 'eu' ? 'https://stake.eu' : site === 'com' ? await resolveStakeLoginOrigin() : undefined);
    await openStakeLoginWindow(origin);
});

ipcMain.handle('stake-get-site', async () => {
    return {
      preferredSite: getPreferredStakeSite(),
      activeOrigin: await resolveStakeOrigin(),
      statuses: await listStakeSiteStatuses(),
    };
});

ipcMain.handle('stake-set-site', async (_event, site: StakePreferredSite | string) => {
    const preferredSite = setPreferredStakeSite(site);
    // Bridge-Fenster an neue Origin binden (403-Fallback / browser fetch).
    if (stakeBridgeWin && !stakeBridgeWin.isDestroyed()) {
      try {
        stakeBridgeWin.destroy();
      } catch {
        /* ignore */
      }
      stakeBridgeWin = null;
    }
    const statuses = await listStakeSiteStatuses();
    const status = await getStakeSessionStatus(true);
    return { preferredSite, statuses, status };
});

ipcMain.handle('stake-site-statuses', async () => {
    return listStakeSiteStatuses();
});

/** Wipe cookies/cache/session files and relaunch — hard reset for stuck login/session. */
ipcMain.handle('app-delete-cache', async () => {
  const wipeSession = async (ses: Electron.Session) => {
    try {
      await ses.clearCache();
    } catch (err) {
      console.warn('[delete-cache] clearCache', err);
    }
    try {
      await ses.clearStorageData();
    } catch (err) {
      console.warn('[delete-cache] clearStorageData', err);
    }
    try {
      await ses.clearAuthCache();
    } catch (err) {
      console.warn('[delete-cache] clearAuthCache', err);
    }
    try {
      await ses.clearHostResolverCache();
    } catch {
      /* optional */
    }
  };

  const removeCookiesForOrigin = async (ses: Electron.Session, origin: string) => {
    try {
      const cookies = await ses.cookies.get({ url: origin });
      for (const c of cookies) {
        const domain = c.domain?.startsWith('.') ? c.domain : c.domain || new URL(origin).hostname;
        const url = `${c.secure ? 'https' : 'http'}://${domain.replace(/^\./, '')}${c.path || '/'}`;
        try {
          await ses.cookies.remove(url, c.name);
        } catch {
          try {
            await ses.cookies.remove(origin, c.name);
          } catch {
            /* ignore single cookie */
          }
        }
      }
    } catch (err) {
      console.warn('[delete-cache] cookies', origin, err);
    }
  };

  const ses = session.defaultSession;
  await wipeSession(ses);
  for (const origin of [STAKE_ORIGIN_COM, STAKE_ORIGIN_BET, STAKE_ORIGIN_EU]) {
    await removeCookiesForOrigin(ses, origin);
  }

  try {
    const forumSes = session.fromPartition(FORUM_SESSION_PARTITION);
    await wipeSession(forumSes);
  } catch (err) {
    console.warn('[delete-cache] forum partition', err);
  }

  const ud = app.getPath('userData');
  const filesToDelete = [
    'stake-site.json',
    'telegram_string_session.txt',
    // Keep telegram_user_config.json (API id/hash) — only wipe login session above.
  ];
  for (const name of filesToDelete) {
    try {
      fs.unlinkSync(path.join(ud, name));
    } catch {
      /* missing ok */
    }
  }

  // Best-effort wipe of Chromium cache folders under userData
  for (const dirName of ['Cache', 'Code Cache', 'GPUCache', 'Session Storage', 'Local Storage', 'Cookies', 'Cookies-journal']) {
    try {
      fs.rmSync(path.join(ud, dirName), { recursive: true, force: true });
    } catch {
      /* locked/missing ok */
    }
  }

  invalidateStakeSessionStatusCache();

  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 150);

  return { ok: true };
});

ipcMain.handle('get-keyauth-hwid', async () => {
    try {
        const data = [
            os.hostname(),
            os.platform(),
            os.arch(),
            os.cpus()[0]?.model || 'unknown-cpu',
            os.totalmem()
        ].join('|');
        return crypto.createHash('sha256').update(data).digest('hex');
    } catch (error) {
        console.error('Failed to generate HWID:', error);
        return 'fallback-electron-hwid';
    }
});

ipcMain.handle('open-external', async (_event, url) => {
    await openExternalSafe(String(url || ''));
});

ipcMain.handle(
    'open-slot-popup',
    async (
        event,
        payload: {
            slug?: string
            locale?: string
            sourceCurrency?: string
            targetCurrency?: string
            launchUrl?: string
        } = {}
    ) => {
    const rawSlug = String(payload?.slug || '').trim().toLowerCase();
    const slug = rawSlug.replace(/[^a-z0-9-]/g, '');
    if (!slug) return { ok: false, error: 'invalid_slug' };

    const localeRaw = String(payload?.locale || 'de').trim().toLowerCase();
    const locale = /^[a-z]{2}(-[a-z]{2})?$/.test(localeRaw) ? localeRaw : 'de';
    const sourceCurrency = String(payload?.sourceCurrency || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetCurrency = String(payload?.targetCurrency || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const launchUrlRaw = String(payload?.launchUrl || '').trim()
    let targetUrl = ''
    if (launchUrlRaw) {
        try {
            const parsed = new URL(launchUrlRaw)
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                targetUrl = parsed.toString()
            }
        } catch {
            // ignore invalid launch URL and fallback below
        }
    }
    if (!targetUrl) {
        const origin = await resolveStakeOrigin();
        const url = new URL(`${origin}/${locale}/casino/games/${slug}`);
        if (targetCurrency) {
            url.searchParams.set('currency', targetCurrency);
            url.searchParams.set('target', targetCurrency);
            url.searchParams.set('targetCurrency', targetCurrency);
        }
        if (sourceCurrency) {
            url.searchParams.set('source', sourceCurrency);
            url.searchParams.set('sourceCurrency', sourceCurrency);
        }
        targetUrl = url.toString();
    }
    const popupId = `slot-popup-${Date.now()}-${++slotPopupSeq}`;

    const popup = new BrowserWindow({
        width: 1360,
        height: 860,
        parent: win || undefined,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false,
            /** Gleiche Cookie-Session wie Hauptfenster (Bonus-Slot-Popup / eingeloggter Stake-Tab). */
            session: win?.webContents.session ?? session.defaultSession,
        },
    });

    popup.webContents.setWindowOpenHandler(({ url }) => {
        openExternalSafe(url).catch((err) => console.warn('Blocked external URL:', err?.message || err));
        return { action: 'deny' };
    });

    popup.on('closed', () => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('slot-popup-closed', {
                popupId,
                slug,
                closedAt: new Date().toISOString(),
            });
        }
    });

    await popup.loadURL(targetUrl);
    return { ok: true, url: targetUrl, popupId };
});

/**
 * Opens Stake wallet (withdraw tab) in an app window and injects the destination address into the cashier textarea.
 * Uses the same session as the main window (wie `open-slot-popup` / Bonus-Opening).
 */
ipcMain.handle(
    'open-stake-withdraw-prefill',
    async (
        _event,
        payload: { address: string; currency: string; chain?: string; locale?: string } = {} as never
    ) => {
        const address = String(payload?.address || '').trim();
        if (!address || address.length > 512) {
            return { ok: false, error: 'invalid_address' as const };
        }
        const currency = String(payload?.currency || 'usdc')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        if (!currency) {
            return { ok: false, error: 'invalid_currency' as const };
        }
        const chainRaw = payload?.chain != null ? String(payload.chain).trim() : '';
        const chain = chainRaw ? chainRaw.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const localeRaw = String(payload?.locale || 'de').trim().toLowerCase();
        const locale = /^[a-z]{2}(-[a-z]{2})?$/.test(localeRaw) ? localeRaw : 'de';

        const stakeSession = await getStakeSessionStatus(false);
        if (!stakeSession.valid) {
            return {
                ok: false,
                error: 'session_invalid' as const,
                reasons: stakeSession.reasons,
            };
        }
        const origin = stakeSession.origin;
        const params = new URLSearchParams();
        params.set('tab', 'withdraw');
        params.set('currency', currency);
        params.set('modal', 'wallet');
        if (chain) params.set('chain', chain);
        const targetUrl = `${origin}/${locale}?${params.toString()}`;

        const sharedSession = win?.webContents.session ?? session.defaultSession;

        if (withdrawPrefillWin && !withdrawPrefillWin.isDestroyed()) {
            try {
                withdrawPrefillWin.destroy();
            } catch {
                /* ignore */
            }
            withdrawPrefillWin = null;
        }

        withdrawPrefillWin = new BrowserWindow({
            width: 520,
            height: 860,
            parent: win || undefined,
            show: true,
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                backgroundThrottling: false,
                session: sharedSession,
            },
        });

        withdrawPrefillWin.webContents.setWindowOpenHandler(({ url }) => {
            openExternalSafe(url).catch((err) => console.warn('Blocked external URL:', err?.message || err));
            return { action: 'deny' };
        });

        withdrawPrefillWin.on('closed', () => {
            withdrawPrefillWin = null;
        });

        const wc = withdrawPrefillWin.webContents;
        await withdrawPrefillWin.loadURL(targetUrl);

        const filled = await fillStakeWithdrawAddressField(wc, address);
        if (!filled) {
            console.warn('[open-stake-withdraw-prefill] Address field not filled (timeout or modal). URL:', targetUrl);
        }

        return { ok: true, url: targetUrl, filled };
    }
);

ipcMain.handle('get-session-token', async () => {
    const status = await getStakeSessionStatus(false);
    return status.sessionToken;
});

ipcMain.handle('stake-session-status', async () => {
    return getStakeSessionStatus(false);
});

ipcMain.handle('stake-session-revalidate', async () => {
    invalidateStakeSessionStatusCache();
    const status = await getStakeSessionStatus(true);
    return status;
});

/** WebSocket muss dieselbe Stake-Origin wie die Session nutzen (stake.bet vs stake.com). */
ipcMain.handle('get-stake-ws-url', async () => {
    const origin = await resolveStakeOrigin();
    return origin.replace(/^https/, 'wss') + '/_api/websockets';
});

ipcMain.handle('logger-fetch-currency-rates', async () => {
    try {
        const sessionStatus = await ensureValidStakeSession(false);
        throwIfSessionInvalid(sessionStatus);
        const origin = sessionStatus.origin;
        const res = await fetch(`${origin}/_api/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: sessionStatus.cookieHeader || '',
                'User-Agent': sessionStatus.userAgent || 'Mozilla/5.0',
                'x-access-token': sessionStatus.sessionToken || '',
                Origin: origin,
                Referer: origin + '/',
            },
            body: JSON.stringify({
                query: LOGGER_CURRENCY_CONFIG_QUERY,
                variables: { isAcp: false },
            }),
        });
        if (!res.ok) return {};
        const json = await res.json();
        const baseRates = json?.data?.currencyConfiguration?.baseRates;
        if (!Array.isArray(baseRates)) return {};
        const map: Record<string, number> = {};
        for (const r of baseRates) {
            const code = String(r?.currency || '').toLowerCase();
            const usdRate = Number(r?.baseRate);
            if (code && Number.isFinite(usdRate) && usdRate > 0) map[code] = usdRate;
        }
        return map;
    } catch (error) {
        console.error('[logger-fetch-currency-rates] failed:', error);
        return {};
    }
});

ipcMain.handle('logger-save-bet', async () => {
    /** Background houseBet logging disabled — use Challenge Hub export + Logger import. */
    return null;
});

ipcMain.handle('logger-load-bet-logs', async (_event, options: { limit?: number; fromDate?: string; toDate?: string } = {}) => {
    const dir = getBetLogsDir();
    const files = (fs.readdirSync(dir) || []).filter((f) => f.endsWith('.jsonl')).sort().reverse();
    const limitRaw = Number(options.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : Number.MAX_SAFE_INTEGER;
    const fromDate = options.fromDate;
    const toDate = options.toDate;
    const bets: any[] = [];
    for (const file of files) {
        const dateStr = file.replace('bets-', '').replace('.jsonl', '');
        if (fromDate && dateStr < fromDate) continue;
        if (toDate && dateStr > toDate) continue;
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0 && bets.length < limit; i--) {
            try {
                bets.push(JSON.parse(lines[i]));
            } catch {
                // ignore broken lines
            }
        }
        if (bets.length >= limit) break;
    }
    return bets.reverse();
});

ipcMain.handle('logger-get-logs-dir', () => getBetLogsDir());

ipcMain.handle('logger-export-bet-logs', async (_event, bets: any[]) => {
    if (!Array.isArray(bets) || bets.length === 0) return { ok: false, error: 'Keine Daten zum Exportieren' };
    const { filePath } = await dialog.showSaveDialog({
        title: 'Wetten exportieren',
        defaultPath: `bets-export-${new Date().toISOString().slice(0, 10)}.jsonl`,
        filters: [{ name: 'JSONL (HouseBets)', extensions: ['jsonl'] }],
    });
    if (!filePath) return { ok: false, cancelled: true };
    const lines = bets.map((b) => JSON.stringify(b)).join('\n') + (bets.length ? '\n' : '');
    fs.writeFileSync(filePath, lines, 'utf8');
    return { ok: true, path: filePath };
});

ipcMain.handle('logger-import-bet-logs', async () => {
    const { filePaths } = await dialog.showOpenDialog({
        title: 'Wetten importieren',
        filters: [{ name: 'JSONL (HouseBets)', extensions: ['jsonl'] }],
        properties: ['openFile'],
    });
    if (!filePaths?.length) return { ok: false, cancelled: true, bets: [] };
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const bets: any[] = [];
    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            if (entry && (entry.houseId != null || entry.iid != null || entry.betId != null || entry.receivedAt != null)) bets.push(entry);
        } catch {
            // ignore broken lines
        }
    }
    if (bets.length === 0) return { ok: true, bets: [], saved: false };
    return { ok: true, bets, saved: false };
});

ipcMain.handle('logger-delete-all-bet-logs', async () => {
    try {
        const dir = getBetLogsDir();
        const files = (fs.readdirSync(dir) || []).filter((f) => f.endsWith('.jsonl'));
        let deleted = 0;
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(dir, file));
                deleted++;
            } catch {
                // ignore locked files
            }
        }
        return { ok: true, deleted };
    } catch (error: any) {
        return { ok: false, error: error?.message || String(error) };
    }
});

function stakeGraphqlOperationType(queryStr: string): 'query' | 'mutation' {
    const t = String(queryStr || '').trim().toLowerCase();
    return t.startsWith('mutation') ? 'mutation' : 'query';
}

/** Wie Browser-HAR (Seedchange2): x-language aus Referer-Pfad /de/casino/… oder Payload. */
function stakeGraphqlLanguageHeader(
    refererHeader: string,
    explicit?: string
): { xLanguage: string; acceptLanguage: string } {
    const fromExplicit = String(explicit || '')
        .trim()
        .toLowerCase()
        .split('-')[0];
    let code = /^[a-z]{2}$/.test(fromExplicit) ? fromExplicit : '';
    if (!code && refererHeader) {
        try {
            const segs = new URL(refererHeader).pathname.split('/').filter(Boolean);
            const first = (segs[0] || '').toLowerCase();
            if (/^[a-z]{2}$/.test(first)) code = first;
        } catch {
            // ignore
        }
    }
    if (!code) code = 'en';
    let acceptLanguage = 'en-US,en;q=0.9';
    if (code === 'de') {
        acceptLanguage = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7';
    } else if (code !== 'en') {
        acceptLanguage = `${code},en-US;q=0.8,en;q=0.7`;
    }
    return { xLanguage: code, acceptLanguage };
}

type StakeGraphqlInvokePayload = {
    query: string;
    variables?: unknown;
    operationName?: string;
    referer?: string;
    language?: string;
};

/**
 * Stake `/_api/graphql` mit Session, Token-Fallback und 403→Browser-Fallback (wie `api-request`).
 * @param contextLabel nur für Login-/Fehler-Logs (z. B. `api-request`, `rotate-stake-engine-seed`).
 */
async function stakeGraphqlInvoke(
    payload: StakeGraphqlInvokePayload,
    contextLabel = 'api-request'
): Promise<unknown> {
    const { query, variables, operationName } = payload;
    const refererOverride =
        typeof payload?.referer === 'string' ? String(payload.referer).trim() : '';
    const languageOverride =
        typeof payload?.language === 'string' ? String(payload.language).trim() : '';
    let lastError: unknown = null;

    for (let attempt = 0; attempt < STAKE_MAX_AUTH_RETRIES; attempt++) {
        const forceCheck = attempt > 0;
        try {
            const sessionStatus = await ensureValidStakeSession(forceCheck);
            throwIfSessionInvalid(sessionStatus);
            const origin = sessionStatus.origin;
            let refererHeader = `${origin}/`;
            if (refererOverride) {
                try {
                    const ru = new URL(refererOverride);
                    const ou = new URL(origin);
                    if (ru.origin === ou.origin) refererHeader = refererOverride;
                } catch {
                    // ungültige URL → Default-Referer
                }
            }
            const { xLanguage, acceptLanguage } = stakeGraphqlLanguageHeader(refererHeader, languageOverride);
            const tokenModes: Array<'with_token' | 'without_token'> = sessionStatus.sessionToken
                ? ['with_token', 'without_token']
                : ['without_token'];
            for (const tokenMode of tokenModes) {
                try {
                    /** Seedchange2/3 HAR: Queries wildcard-Accept + x-operation-name; RotateSeed: graphql+json-Accept + operationName im Body. */
                    const gqlOpType = stakeGraphqlOperationType(String(query || ''));
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        Origin: origin,
                        Referer: refererHeader,
                        'Accept-Language': acceptLanguage,
                        'x-language': xLanguage,
                        'User-Agent': sessionStatus.userAgent || 'Mozilla/5.0',
                    };
                    if (gqlOpType === 'mutation') {
                        headers.Accept = 'application/graphql+json, application/json';
                    } else {
                        headers.Accept = '*/*';
                        headers['x-operation-name'] = String(operationName || '');
                        headers['x-operation-type'] = 'query';
                    }
                    if (tokenMode === 'with_token' && sessionStatus.sessionToken) {
                        headers['x-access-token'] = sessionStatus.sessionToken;
                    }
                    /** Seedchange3.har: Mutations (RotateSeed) senden `operationName` im Body; Queries nutzen x-operation-name. */
                    const graphqlBody: Record<string, unknown> = {
                        query,
                        variables: variables ?? {},
                    };
                    if (gqlOpType === 'mutation' && operationName) {
                        graphqlBody.operationName = operationName;
                    }
                    let response;
                    try {
                        response = await stakeNetPostJson(`${origin}/_api/graphql`, headers, graphqlBody);
                    } catch (netError) {
                        if (netError instanceof StakeHttpError && netError.status === 403) {
                            const preview = String(netError.body || '').slice(0, 180);
                            const now = Date.now();
                            if (now - lastNet403FallbackLogAt >= NET_403_FALLBACK_LOG_DEBOUNCE_MS) {
                                console.warn('[StakeSession] net.request 403, trying browser-context fallback', {
                                    tokenMode,
                                    preview,
                                });
                                lastNet403FallbackLogAt = now;
                            }
                            response = await stakeBrowserPostJson(`${origin}/_api/graphql`, headers, graphqlBody);
                        } else {
                            throw netError;
                        }
                    }
                    return response.parsed;
                } catch (innerError) {
                    if (
                        innerError instanceof StakeHttpError &&
                        (innerError.status === 401 || innerError.status === 403) &&
                        tokenMode === 'with_token'
                    ) {
                        console.warn('[StakeSession] GraphQL rejected with x-access-token, retrying cookie-only');
                        continue;
                    }
                    throw innerError;
                }
            }
        } catch (error) {
            lastError = error;
            if (error instanceof StakeHttpError && (error.status === 401 || error.status === 403)) {
                invalidateStakeSessionStatusCache();
                if (attempt + 1 < STAKE_MAX_AUTH_RETRIES) continue;
                const cf = isCloudflareChallengeHtml(error.body);
                openLoginWindowForRejectedSession(
                  `${contextLabel} ${error.status}${cf ? ' cloudflare' : ''}`
                );
                throw new Error(
                  cf
                    ? `Session rejected (${error.status}). Cloudflare window opened — complete the check, it stays until Stake API works.`
                    : `Session rejected (${error.status}). Login window opened.`
                );
            }
            if (String((error as Error)?.message || '').includes('Session rejected')) {
                invalidateStakeSessionStatusCache();
                if (attempt + 1 < STAKE_MAX_AUTH_RETRIES) continue;
                openLoginWindowForRejectedSession(`${contextLabel} session invalid`);
                throw new Error('Session rejected. Login window opened.');
            }
            throw error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('API request failed');
}

ipcMain.handle('api-request', async (_event, payload) => stakeGraphqlInvoke(payload));

/** Stake.eu ClaimTopUpBonus Turnstile — hidden window on defaultSession (same cookies as login). */
ipcMain.handle(
  'solve-eu-turnstile',
  async (_event, payload?: { sitekey?: string; timeoutMs?: number }) => {
    return solveEuTopUpTurnstile({
      sitekey: typeof payload?.sitekey === 'string' ? payload.sitekey : undefined,
      timeoutMs: typeof payload?.timeoutMs === 'number' ? payload.timeoutMs : undefined,
    });
  }
);

/** StakeCruncher tracker API (GET only, public stats / lookup tables). */
function stakeCruncherRefererForPath(path: string): string | undefined {
  const lookupSlug = path.match(/[?&]slug=([^&]+)/)?.[1];
  if (path.includes('/verifier/lookup-table') && lookupSlug) {
    return `https://stakecruncher.com/slots-tracker/stats/${decodeURIComponent(lookupSlug)}`;
  }
  const catalogSlug = path.match(/\/verifier\/catalog\/([^/?]+)/)?.[1];
  if (catalogSlug) {
    return `https://stakecruncher.com/slots-tracker/stats/${decodeURIComponent(catalogSlug)}`;
  }
  const statsTail = path.split('/engine/stats/games/')[1]?.split('?')[0] ?? '';
  const statsSlug = statsTail.split('/')[0]?.trim();
  if (statsSlug && !statsSlug.includes('?')) {
    return `https://stakecruncher.com/slots-tracker/stats/${decodeURIComponent(statsSlug)}`;
  }
  return 'https://stakecruncher.com/slots-tracker';
}

ipcMain.handle('cruncher-api-fetch', async (_event, payload) => {
  const path = String(payload?.path || '').trim();
  if (!path.startsWith('/tracker-api/')) {
    throw new Error('Invalid StakeCruncher path');
  }
  const url = `https://stakecruncher.com${path}`;
  const headers: Record<string, string> = {
    Accept: '*/*',
    'User-Agent': `swqbot/${app.getVersion()}`,
  };
  const referer = stakeCruncherRefererForPath(path);
  if (referer) headers.Referer = referer;

  const res = await fetch(url, { method: 'GET', headers });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    console.error('[StakeCruncher][main] HTTP', res.status, path, { referer: headers.Referer });
  }
  return {
    ok: res.ok,
    status: res.status,
    bodyBase64: buf.toString('base64'),
  };
});

/** SSP-kompatibler Name: RGS/Casino-Slot `rotateSeed` (nicht `rotateSeedPair` / Originals). */
const RGS_ROTATE_GAME_INFORMATION_QUERY = `query GameInformation($gameId: String!) {
  gameInformation(gameId: $gameId) {
    name
    version { version active created modes { costMultiplier name weightSum rtp eventCount __typename } __typename }
    __typename
  }
}`;

const RGS_ROTATE_USER_GAME_FAIR_QUERY = `query UserGameFair($gameId: String!) {
  userGameFair(gameId: $gameId) {
    clientSeed
    nonce
    serverSeedHash
    serverSeedNext
    __typename
  }
}`;

const RGS_ROTATE_SEED_MUTATION = `mutation RotateSeed($clientSeed: String!, $gameId: String!, $nextHashedServerSeed: String!) {
  rotateSeed(clientSeed: $clientSeed, gameId: $gameId, nextHashedServerSeed: $nextHashedServerSeed) {
    activeSeed { clientSeed nonce serverSeedHash serverSeedNext __typename }
    revealedSeed { clientSeed serverSeedHash __typename }
    __typename
  }
}`;

/** Wie Seedchange3 / Stake-Web: RGS-rotateSeed clientSeed = genau 8 alphanumerische Zeichen. */
const RGS_CLIENT_SEED_CHARS_MAIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const RGS_CLIENT_SEED_LEN_MAIN = 8;

function randomRgsClientSeedForMain(): string {
    let s = '';
    for (let i = 0; i < RGS_CLIENT_SEED_LEN_MAIN; i++) {
        s += RGS_CLIENT_SEED_CHARS_MAIN[Math.floor(Math.random() * RGS_CLIENT_SEED_CHARS_MAIN.length)];
    }
    return s;
}

function pickRgsClientSeedForMain(clientSeed?: string): string {
    const raw = String(clientSeed || '').trim();
    if (raw && /^[A-Za-z0-9]{8}$/.test(raw)) return raw;
    return randomRgsClientSeedForMain();
}

ipcMain.handle(
    'rotate-stake-engine-seed',
    async (
        _event,
        payload: {
            gameId?: string;
            clientSeed?: string;
            /** Fairness-Modal-URL mit tab=seeds empfohlen (HAR Seedchange2). */
            referer?: string;
            language?: string;
        } = {}
    ) => {
        const gid = String(payload?.gameId || '').trim();
        if (!gid) {
            return { ok: false as const, error: 'missing_gameId', gameId: '' };
        }

        const seedsReferer = String(payload?.referer || '').trim();
        const overviewReferer =
            seedsReferer && /\btab=seeds\b/.test(seedsReferer)
                ? seedsReferer.replace(/\btab=seeds\b/, 'tab=overview')
                : seedsReferer;
        const lang = typeof payload?.language === 'string' ? payload.language : '';

        const ctx = 'rotate-stake-engine-seed';
        if (overviewReferer) {
            try {
                await stakeGraphqlInvoke(
                    {
                        query: RGS_ROTATE_GAME_INFORMATION_QUERY,
                        variables: { gameId: gid },
                        operationName: 'GameInformation',
                        referer: overviewReferer,
                        language: lang,
                    },
                    ctx
                );
            } catch {
                /* Prime optional — wie Renderer stakeFairness */
            }
            try {
                await stakeGraphqlInvoke(
                    {
                        query: RGS_ROTATE_USER_GAME_FAIR_QUERY,
                        variables: { gameId: gid },
                        operationName: 'UserGameFair',
                        referer: overviewReferer,
                        language: lang,
                    },
                    ctx
                );
            } catch {
                /* idem */
            }
        }

        const maxRotateAttempts = 5;
        let lastError = '';
        for (let attempt = 0; attempt < maxRotateAttempts; attempt++) {
            if (attempt > 0) {
                await new Promise((r) => setTimeout(r, 100 * attempt));
            }

            let fairParsed: unknown;
            try {
                fairParsed = await stakeGraphqlInvoke(
                    {
                        query: RGS_ROTATE_USER_GAME_FAIR_QUERY,
                        variables: { gameId: gid },
                        operationName: 'UserGameFair',
                        referer: overviewReferer || undefined,
                        language: lang,
                    },
                    ctx
                );
            } catch (e) {
                const msg = String((e as Error)?.message || e);
                if (msg.includes('Session rejected')) throw e;
                lastError = msg;
                continue;
            }

            const fair = (fairParsed as { data?: { userGameFair?: { serverSeedNext?: unknown } } })?.data
                ?.userGameFair;
            const nextHashed =
                fair?.serverSeedNext != null ? String(fair.serverSeedNext).trim() : '';
            if (!nextHashed) {
                return {
                    ok: false as const,
                    error: 'userGameFair ohne serverSeedNext (falsche gameId oder Spiel ohne PF?)',
                    gameId: gid,
                };
            }

            const seed = pickRgsClientSeedForMain(payload?.clientSeed);
            try {
                const mutParsed = await stakeGraphqlInvoke(
                    {
                        query: RGS_ROTATE_SEED_MUTATION,
                        variables: {
                            clientSeed: seed,
                            gameId: gid,
                            nextHashedServerSeed: nextHashed,
                        },
                        operationName: 'RotateSeed',
                        referer: seedsReferer || undefined,
                        language: lang,
                    },
                    ctx
                );
                const rotated = (mutParsed as { data?: { rotateSeed?: { activeSeed?: { clientSeed?: string } } } })
                    ?.data?.rotateSeed;
                const active = rotated?.activeSeed;
                if (active?.clientSeed) {
                    return {
                        ok: true as const,
                        seed: active.clientSeed,
                        result: rotated ?? null,
                        gameId: gid,
                    };
                }
                lastError = 'rotateSeed ohne activeSeed';
            } catch (e) {
                const msg = String((e as Error)?.message || e);
                if (msg.includes('Session rejected')) throw e;
                lastError = msg;
            }
        }

        return {
            ok: false as const,
            gameId: gid,
            error: lastError || 'rotateSeed nach mehreren Versuchen fehlgeschlagen',
        };
    }
);

/** Stake Originals REST (z. B. Blackjack) – POST mit Session-Cookies wie GraphQL. */
ipcMain.handle(
    'stake-casino-rest-post',
    async (_event, payload: { path?: string; body?: unknown; referer?: string }) => {
        const pathStr = String(payload?.path || '').trim();
        if (!pathStr.startsWith('/_api/casino/')) {
            return Promise.reject(new Error('Ungültiger Casino-REST-Pfad.'));
        }
        const bodyObj = payload?.body && typeof payload.body === 'object' ? payload.body : {};
        let lastError: unknown = null;

        for (let attempt = 0; attempt < STAKE_MAX_AUTH_RETRIES; attempt++) {
            const forceCheck = attempt > 0;
            try {
                const sessionStatus = await ensureValidStakeSession(forceCheck);
                throwIfSessionInvalid(sessionStatus);
                const origin = sessionStatus.origin;
                const referer =
                    typeof payload?.referer === 'string' && payload.referer.trim().startsWith('http')
                        ? payload.referer.trim()
                        : `${origin}/casino/games/blackjack`;
                const tokenModes: Array<'with_token' | 'without_token'> = sessionStatus.sessionToken
                    ? ['with_token', 'without_token']
                    : ['without_token'];
                for (const tokenMode of tokenModes) {
                    try {
                        const headers: Record<string, string> = {
                            'Content-Type': 'application/json',
                            Accept: 'application/json, text/plain, */*',
                            'x-lockdown-token': `sl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            Origin: origin,
                            Referer: referer,
                            'User-Agent': sessionStatus.userAgent || 'Mozilla/5.0',
                        };
                        if (tokenMode === 'with_token' && sessionStatus.sessionToken) {
                            headers['x-access-token'] = sessionStatus.sessionToken;
                        }
                        const response = await stakeNetPostJson(origin + pathStr, headers, bodyObj);
                        const parsed = response.parsed;
                        if (parsed && typeof parsed === 'object') {
                            const po = parsed as Record<string, unknown>;
                            if (Array.isArray(po.errors) && po.errors.length > 0) {
                                throw new Error(`Casino-REST: ${extractStakeJsonErrorMessage(parsed)}`);
                            }
                        }
                        return parsed;
                    } catch (innerError) {
                        if (
                            innerError instanceof StakeHttpError &&
                            (innerError.status === 401 || innerError.status === 403) &&
                            tokenMode === 'with_token'
                        ) {
                            console.warn('[StakeSession] Casino-REST rejected with x-access-token, retrying cookie-only');
                            continue;
                        }
                        throw innerError;
                    }
                }
            } catch (error) {
                lastError = error;
                if (error instanceof StakeHttpError && (error.status === 401 || error.status === 403)) {
                    invalidateStakeSessionStatusCache();
                    if (attempt + 1 < STAKE_MAX_AUTH_RETRIES) continue;
                    openLoginWindowForRejectedSession(`stake-casino-rest-post ${error.status}`);
                    throw new Error(`Session rejected (${error.status}). Login window opened.`);
                }
                if (String((error as Error)?.message || '').includes('Session rejected')) {
                    invalidateStakeSessionStatusCache();
                    if (attempt + 1 < STAKE_MAX_AUTH_RETRIES) continue;
                    openLoginWindowForRejectedSession('stake-casino-rest-post session invalid');
                    throw new Error('Session rejected. Login window opened.');
                }
                throw error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Casino-REST request failed');
    }
);

// Slot Spin Samples – automatisches Speichern pro Slot in Ordner
ipcMain.handle('save-slot-spin-sample', async (_event, payload: { slotSlug: string; slotName?: string; providerId?: string; request: any; response: any }) => {
  try {
    const { slotSlug, slotName, providerId, request, response } = payload;
    if (!slotSlug || typeof slotSlug !== 'string') return;
    const slug = slotSlug.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (!slug) return;

    if (!fs.existsSync(SPIN_SAMPLES_DIR)) {
      fs.mkdirSync(SPIN_SAMPLES_DIR, { recursive: true });
    }

    const filePath = path.join(SPIN_SAMPLES_DIR, `${slug}.json`);
    const entry = {
      ts: new Date().toISOString(),
      slotName: slotName || null,
      providerId: providerId || null,
      request: request ?? null,
      response: response ?? null,
    };

    let entries: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        entries = JSON.parse(raw);
      } catch {
        /* ignore corrupt JSON */
      }
    }
    entries = [entry, ...entries].slice(0, 2);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
    console.log('[SlotSpinSamples] Saved:', slug, '→', filePath);
  } catch (e) {
    console.error('[SlotSpinSamples] Save failed:', e);
  }
});

ipcMain.handle('get-slot-spin-samples', async () => {
  try {
    if (!fs.existsSync(SPIN_SAMPLES_DIR)) return {};
    const files = fs.readdirSync(SPIN_SAMPLES_DIR).filter((f) => f.endsWith('.json'));
    const result: Record<string, any[]> = {};
    for (const f of files) {
      const slug = f.replace(/\.json$/, '');
      try {
        const raw = fs.readFileSync(path.join(SPIN_SAMPLES_DIR, f), 'utf-8');
        result[slug] = JSON.parse(raw);
      } catch {
        /* ignore corrupt JSON */
      }
    }
    return result;
  } catch (e) {
    console.error('[SlotSpinSamples] Read failed:', e);
    return {};
  }
});

ipcMain.handle('get-spin-samples-dir', () => SPIN_SAMPLES_DIR);

ipcMain.handle('clear-slot-spin-samples', async () => {
  try {
    if (fs.existsSync(SPIN_SAMPLES_DIR)) {
      for (const f of fs.readdirSync(SPIN_SAMPLES_DIR)) {
        fs.unlinkSync(path.join(SPIN_SAMPLES_DIR, f));
      }
    }
  } catch (e) {
    console.error('[SlotSpinSamples] Clear failed:', e);
  }
});

function sanitizeSlotDirSegment(slug: string): string {
  return String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const FIRST_WINS_MASTER_CSV = 'first-wins.csv';
const FIRST_WINS_CSV_HEADER =
  'savedAt,slotSlug,slotName,providerId,providerGroupSlug,betAmountMinor,winAmountMinor,currency,multiplier,roundId,shareBetId,jsonPath';

function csvEscapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function firstWinCsvLine(
  doc: {
    savedAt: string;
    slotSlug: string;
    slotName: string | null;
    providerId: string | null;
    providerGroupSlug: string | null;
    betAmountMinor: number | null;
    winAmountMinor: number;
    currency: string | null;
    multiplier: number | null;
    roundId: string | null;
    shareBetId: string | null;
  },
  jsonPathForCsv: string
): string {
  return [
    doc.savedAt,
    doc.slotSlug,
    doc.slotName ?? '',
    doc.providerId ?? '',
    doc.providerGroupSlug ?? '',
    doc.betAmountMinor ?? '',
    doc.winAmountMinor,
    doc.currency ?? '',
    doc.multiplier ?? '',
    doc.roundId ?? '',
    doc.shareBetId ?? '',
    jsonPathForCsv,
  ]
    .map(csvEscapeCell)
    .join(',');
}

/** Master-Log unter slot-first-wins/first-wins.csv + pro Slot first-win.csv (Excel: UTF-8 BOM). */
function writeFirstWinCsvFiles(
  doc: Parameters<typeof firstWinCsvLine>[0],
  jsonAbsPath: string,
  slotDir: string
): { masterCsvPath: string; slotCsvPath: string } {
  const masterCsvPath = path.join(FIRST_SLOT_WINS_DIR, FIRST_WINS_MASTER_CSV);
  const slotCsvPath = path.join(slotDir, 'first-win.csv');
  const line = firstWinCsvLine(doc, jsonAbsPath) + '\n';
  const BOM = '\uFEFF';

  const masterExists = fs.existsSync(masterCsvPath);
  if (!masterExists) {
    fs.writeFileSync(masterCsvPath, BOM + FIRST_WINS_CSV_HEADER + '\n' + line, 'utf-8');
  } else {
    fs.appendFileSync(masterCsvPath, line, 'utf-8');
  }

  fs.writeFileSync(slotCsvPath, BOM + FIRST_WINS_CSV_HEADER + '\n' + line, 'utf-8');

  return { masterCsvPath, slotCsvPath };
}

/** Erster Gewinn pro Slot: Ordner pro Spiel, eine Datei first-win.json (nur wenn noch nicht vorhanden). */
ipcMain.handle(
  'save-slot-first-win-if-needed',
  async (
    _event,
    payload: {
      slotSlug: string;
      slotName?: string;
      providerId?: string;
      providerGroupSlug?: string | null;
      betAmountMinor?: number;
      winAmountMinor?: number;
      currency?: string;
      multiplier?: number;
      roundId?: string | null;
      shareBetId?: string | null;
      /** RGS wallet/play Rohwerte (1e6-Skala) — Abgleich wenn Gewinn vs. UI zweifelhaft */
      betAmountApiRaw?: number | null;
      payoutApiRaw?: number | null;
      payoutFromMultiplierApiRaw?: number | null;
    }
  ) => {
    try {
      const { slotSlug, winAmountMinor } = payload;
      if (!slotSlug || typeof slotSlug !== 'string') return { saved: false };
      const w = Number(winAmountMinor);
      if (!Number.isFinite(w) || w <= 0) return { saved: false };

      const dirSeg = sanitizeSlotDirSegment(slotSlug);
      if (!dirSeg) return { saved: false };

      if (!fs.existsSync(FIRST_SLOT_WINS_DIR)) {
        fs.mkdirSync(FIRST_SLOT_WINS_DIR, { recursive: true });
      }
      const slotDir = path.join(FIRST_SLOT_WINS_DIR, dirSeg);
      const filePath = path.join(slotDir, 'first-win.json');
      if (fs.existsSync(filePath)) return { saved: false };

      fs.mkdirSync(slotDir, { recursive: true });
      const doc = {
        savedAt: new Date().toISOString(),
        slotSlug: dirSeg,
        slotName: payload.slotName ?? null,
        providerId: payload.providerId ?? null,
        providerGroupSlug: payload.providerGroupSlug ?? null,
        betAmountMinor: payload.betAmountMinor ?? null,
        winAmountMinor: w,
        currency: payload.currency ?? null,
        multiplier: payload.multiplier ?? null,
        roundId: payload.roundId ?? null,
        shareBetId: payload.shareBetId ?? null,
        betAmountApiRaw: payload.betAmountApiRaw ?? null,
        payoutApiRaw: payload.payoutApiRaw ?? null,
        payoutFromMultiplierApiRaw: payload.payoutFromMultiplierApiRaw ?? null,
      };
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8');
      const { masterCsvPath, slotCsvPath } = writeFirstWinCsvFiles(doc, filePath, slotDir);
      console.log('[SlotFirstWin] Saved:', dirSeg, '→', filePath, '| CSV:', masterCsvPath);
      return { saved: true, path: filePath, csvPath: masterCsvPath, slotCsvPath };
    } catch (e) {
      console.error('[SlotFirstWin] Save failed:', e);
      return { saved: false };
    }
  }
);

ipcMain.handle('get-slot-first-wins-dir', () => FIRST_SLOT_WINS_DIR);

function parsePlayneticLaunchFromUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isPlayneticHost = host.includes('playnetic.com');
    const isOpenEndpoint = u.pathname.includes('/gs/g/o');
    if (!isPlayneticHost && !isOpenEndpoint) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    const gsIdx = parts.indexOf('gs');
    const gamePath = gsIdx > 0 ? parts.slice(0, gsIdx).join('/') : parts[0] || '';
    const token = u.searchParams.get('token');
    const gid = u.searchParams.get('gid');
    if (!token || !gid || !gamePath) return null;

    return {
      apiBase: `${u.protocol}//${u.host}`,
      gamePath,
      oid: u.searchParams.get('oid') || 'Stake.com',
      gid,
      cc: (u.searchParams.get('cc') || 'EUR').toUpperCase(),
      token,
    };
  } catch {
    return null;
  }
}

// Playnetic: gsplauncher → Hidden Window → /gs/g/o Request abfangen
ipcMain.handle('playnetic-resolve-launch', async (_event, configUrl: string) => {
  if (!configUrl || typeof configUrl !== 'string') return null;
  return new Promise<ReturnType<typeof parsePlayneticLaunchFromUrl>>((resolve) => {
    const partition = `playnetic-launch-${Date.now()}`;
    const ses = session.fromPartition(partition, { cache: false });
    const w = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      webPreferences: {
        session: ses,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });
    let settled = false;
    const finish = (value: ReturnType<typeof parsePlayneticLaunchFromUrl>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      w.destroy();
      resolve(value);
    };
    const timeout = setTimeout(() => {
      console.warn('[playnetic] resolvePlayneticLaunch: Timeout nach 20s');
      finish(null);
    }, 20000);

    const tryResolve = (url: string) => {
      const parsed = parsePlayneticLaunchFromUrl(url);
      if (parsed) finish(parsed);
    };

    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      tryResolve(details.url);
      callback({});
    });

    const onNavigate = (_e: Electron.Event, url: string) => {
      tryResolve(url);
    };
    w.webContents.on('did-navigate', onNavigate);
    w.webContents.on('did-navigate-in-page', onNavigate);
    w.loadURL(configUrl).catch((err) => {
      console.warn('[playnetic] resolvePlayneticLaunch: loadURL failed', err?.message);
      finish(null);
    });
  });
});

// Claw Buster: Launcher-URL laden → Redirect zu clawbuster-cdn → secret aus URL extrahieren
ipcMain.handle('clawbuster-extract-secret', async (_event, configUrl: string) => {
  if (!configUrl || typeof configUrl !== 'string') return null;
  return new Promise<string | null>((resolve) => {
    const w = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });
    const timeout = setTimeout(() => {
      console.warn('[clawbuster] extractClawbusterSecret: Timeout nach 15s');
      w.destroy();
      resolve(null);
    }, 15000);
    const onNavigate = (_e: Electron.Event, url: string) => {
      try {
        const u = new URL(url);
        if (u.hostname.includes('clawbuster-cdn.com') || u.hostname.includes('clawbuster')) {
          const secret = u.searchParams.get('secret');
          clearTimeout(timeout);
          w.destroy();
          resolve(secret || null);
        }
      } catch {
        // ignore
      }
    };
    w.webContents.on('did-navigate', onNavigate);
    w.webContents.on('did-navigate-in-page', onNavigate);
    w.loadURL(configUrl).catch((err) => {
      console.warn('[clawbuster] extractClawbusterSecret: loadURL failed', err?.message);
      clearTimeout(timeout);
      w.destroy();
      resolve(null);
    });
  });
});

ipcMain.handle('forum-open-login', () => {
  if (forumLoginWin && !forumLoginWin.isDestroyed()) {
    forumLoginWin.focus();
    return { ok: true as const };
  }
  forumLoginWin = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Stake Community – sign in',
    webPreferences: {
      partition: FORUM_SESSION_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  forumLoginWin.loadURL(`${FORUM_ORIGIN}/login/`);
  forumLoginWin.on('closed', () => {
    forumLoginWin = null;
  });
  return { ok: true as const };
});

ipcMain.handle('forum-session-status', async () => {
  const ses = session.fromPartition(FORUM_SESSION_PARTITION);
  const cookies = await ses.cookies.get({ url: FORUM_ORIGIN });
  const hasCookies = cookies.some((c) => c.value && c.name);
  const hasCf = cookies.some((c) => c.name.startsWith('cf_') || c.name === '__cf_bm');
  return { hasCookies, hasCf, cookieCount: cookies.length };
});

ipcMain.handle(
  'forum-fetch-topic-html',
  async (_event, payload: { url: string; referer?: string; allowChallenge?: boolean }) => {
    const url = String(payload?.url || '').trim();
    if (!isAllowedForumFetchUrl(url)) {
      return {
        ok: false as const,
        skipped: false as const,
        error: 'invalid_url',
        status: 0,
        statusText: '',
        data: '',
        finalUrl: '',
        cloudflare: false as const,
      };
    }
    const allowChallenge = payload?.allowChallenge !== false;
    try {
      let loaded = await loadForumUrlInScrapeWindow(url);
      let cloudflare = isCloudflareChallengeHtml(loaded.html);

      // Interactive CF: open visible window once, then retry via the same partition.
      if (cloudflare && allowChallenge) {
        console.warn('[forum-scraper] Cloudflare challenge detected — opening challenge window');
        await openForumCloudflareChallenge(url);
        loaded = await loadForumUrlInScrapeWindow(url);
        cloudflare = isCloudflareChallengeHtml(loaded.html);
      }

      if (cloudflare) {
        return {
          ok: true as const,
          skipped: false as const,
          status: 403,
          statusText: 'Cloudflare challenge',
          data: loaded.html,
          finalUrl: loaded.finalUrl || url,
          cloudflare: true as const,
          error: 'cloudflare_challenge',
        };
      }

      return {
        ok: true as const,
        skipped: false as const,
        status: 200,
        statusText: 'OK',
        data: loaded.html,
        finalUrl: loaded.finalUrl || url,
        cloudflare: false as const,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false as const,
        skipped: false as const,
        error: msg,
        status: 0,
        statusText: '',
        data: '',
        finalUrl: '',
        cloudflare: false as const,
      };
    }
  }
);

/** Preserve Set-Cookie array values across IPC (plain object, no IncomingHttpHeaders prototype). */
function normalizeOutgoingProxyHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    const setCookies = headers['set-cookie'];
    if (setCookies) {
        out['set-cookie'] = Array.isArray(setCookies) ? setCookies.map(String) : [String(setCookies)];
    }
    for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === 'set-cookie' || val === undefined) continue;
        out[key] = Array.isArray(val) ? val.join(', ') : String(val);
    }
    return out;
}

/** Merge Set-Cookie name=value into an existing Cookie request header (redirect jar). */
function mergeSetCookieIntoCookieHeader(
  existingCookieHeader: string | undefined,
  setCookieLines: string[] | undefined
): string | undefined {
  if (!setCookieLines?.length) return existingCookieHeader || undefined;
  const map = new Map<string, string>();
  for (const part of String(existingCookieHeader || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  for (const line of setCookieLines) {
    const first = String(line || '').split(';')[0] || '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  if (map.size === 0) return existingCookieHeader || undefined;
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

async function decodeProxyResponseBody(
    chunks: Buffer[],
    contentEncoding: string | string[] | undefined
): Promise<string> {
    const raw = Buffer.concat(chunks);
    const enc = (Array.isArray(contentEncoding) ? contentEncoding.join(',') : String(contentEncoding || '')).toLowerCase();
    try {
        if (enc.includes('gzip')) return (await gunzipAsync(raw)).toString('utf8');
        if (enc.includes('br')) return (await brotliDecompressAsync(raw)).toString('utf8');
        if (enc.includes('deflate')) return (await inflateAsync(raw)).toString('utf8');
    } catch (err) {
        console.warn('[proxy-request] decompress failed, using raw body', err);
    }
    return raw.toString('utf8');
}

type NolimitEvoEntryResult = {
    ok: boolean;
    status: number;
    location?: string;
    tableId?: string | null;
    evoSessionId?: string | null;
    cookieString?: string | null;
    cdn?: string | null;
    lang?: string | null;
    locale?: string | null;
    fingerprint?: string;
    evoOrigin?: string;
    error?: string;
};

function parseTableIdFromEvoLocation(location: string): string | null {
    const hash = location.indexOf('#');
    if (hash < 0) return null;
    try {
        return new URLSearchParams(location.slice(hash + 1)).get('table_id');
    } catch {
        return null;
    }
}

function buildNolimitEvoFingerprint(): string {
    return crypto.randomBytes(12).toString('base64');
}

function readSetCookieLines(headers: IncomingHttpHeaders): string[] {
    const raw = headers['set-cookie'];
    if (!raw) return [];
    return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

/** Persist Set-Cookie into Electron session so follow-up proxy calls (SingleSessionAPI) keep the jar. */
async function persistProxySetCookies(targetUrl: string, headers: IncomingHttpHeaders): Promise<void> {
  const lines = readSetCookieLines(headers);
  if (!lines.length) return;
  let origin: string;
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    return;
  }
  for (const line of lines) {
    const parts = String(line).split(';').map((p) => p.trim());
    const nv = parts[0] || '';
    const eq = nv.indexOf('=');
    if (eq <= 0) continue;
    const name = nv.slice(0, eq).trim();
    const value = nv.slice(eq + 1).trim();
    if (!name) continue;
    let path = '/';
    let secure = origin.startsWith('https:');
    let httpOnly = false;
    let expirationDate: number | undefined;
    for (const p of parts.slice(1)) {
      const [kRaw, vRaw] = p.split('=');
      const k = String(kRaw || '').trim().toLowerCase();
      const v = String(vRaw || '').trim();
      if (k === 'path' && v) path = v;
      else if (k === 'secure') secure = true;
      else if (k === 'httponly') httpOnly = true;
      else if (k === 'max-age' && v) {
        const sec = Number(v);
        if (Number.isFinite(sec)) expirationDate = Date.now() / 1000 + sec;
      }
    }
    try {
      await session.defaultSession.cookies.set({
        url: origin + (path.startsWith('/') ? path : `/${path}`),
        name,
        value,
        path,
        secure,
        httpOnly,
        ...(expirationDate != null ? { expirationDate } : {}),
      });
    } catch {
      /* ignore single cookie */
    }
  }
}

function mergeEvoCookiesFromHeaders(headers: IncomingHttpHeaders, into: Map<string, string>) {
    for (const line of readSetCookieLines(headers)) {
        const chunks = line.includes(',')
            ? line.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/)
            : [line];
        for (const chunk of chunks) {
            const head = chunk.trim().split(';')[0]?.trim() || '';
            const eq = head.indexOf('=');
            if (eq <= 0) continue;
            const name = head.slice(0, eq).trim();
            const value = head.slice(eq + 1).trim().replace(/^"|"$/g, '');
            if (name && value) into.set(name, value);
        }
    }
}

function extractEvoSessionIdFromHeaders(headers: IncomingHttpHeaders): string | null {
    for (const line of readSetCookieLines(headers)) {
        const m = line.match(/(?:^|[;,]\s*)EVOSESSIONID=([^;,\s]+)/i);
        if (m?.[1]) return m[1];
    }
    return null;
}

function buildNolimitCookieString(cookieMap: Map<string, string>, fallbackCdn: string): string | null {
    const evoSessionId = cookieMap.get('EVOSESSIONID');
    if (!evoSessionId) return null;
    const cdn = cookieMap.get('cdn') || fallbackCdn;
    const lang = cookieMap.get('lang') || 'fr';
    const locale = cookieMap.get('locale') || 'en';
    return `EVOSESSIONID=${evoSessionId}; cdn=${cdn}; lang=${lang}; locale=${locale}`;
}

function evoEntryRequestOnce(
    url: string,
    cookieMap: Map<string, string>,
    userAgent: string,
    referer?: string
): Promise<{ status: number; headers: IncomingHttpHeaders; location: string }> {
    return new Promise((resolve, reject) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch (err) {
            reject(err);
            return;
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        const agent = isHttps
            ? new https.Agent({ keepAlive: false, maxSockets: 1, maxFreeSockets: 0 })
            : new http.Agent({ keepAlive: false, maxSockets: 1, maxFreeSockets: 0 });

        const cookieParts: string[] = [];
        if (cookieMap.get('EVOSESSIONID')) cookieParts.push(`EVOSESSIONID=${cookieMap.get('EVOSESSIONID')}`);
        if (cookieMap.get('cdn')) cookieParts.push(`cdn=${cookieMap.get('cdn')}`);
        if (cookieMap.get('lang')) cookieParts.push(`lang=${cookieMap.get('lang')}`);
        if (cookieMap.get('locale')) cookieParts.push(`locale=${cookieMap.get('locale')}`);

        const headers: Record<string, string> = {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': userAgent,
        };
        if (cookieParts.length) headers.Cookie = cookieParts.join('; ');
        if (referer) headers.Referer = referer;

        const opts: https.RequestOptions = {
            method: 'GET',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            headers,
            agent,
        };

        const destroyAgent = () => {
            try { agent.destroy(); } catch { /* ignore */ }
        };

        const req = client.request(opts, (res) => {
            res.resume();
            res.on('end', () => {
                destroyAgent();
                const locRaw = res.headers.location as string | undefined;
                const location = locRaw
                    ? (locRaw.startsWith('http') ? locRaw : new URL(locRaw, url).href)
                    : '';
                resolve({ status: res.statusCode || 0, headers: res.headers, location });
            });
        });
        req.on('error', (err) => {
            destroyAgent();
            reject(err);
        });
        req.end();
    });
}

async function nolimitFetchEvoEntry(configUrl: string): Promise<NolimitEvoEntryResult> {
    const startUrl = String(configUrl || '').trim();
    if (!startUrl) return { ok: false, status: 0, error: 'configUrl missing' };

    const fingerprint = buildNolimitEvoFingerprint();
    const userAgent = sessionData.userAgent || STAKE_BROWSER_USER_AGENT;
    const cookieMap = new Map<string, string>();
    let url = startUrl;
    let referer = '';
    let lastStatus = 0;
    let lastLocation = '';
    let tableId: string | null = null;
    let lastCookieNames: string[] = [];
    let fallbackCdn = 'babylonstkn';
    try {
        fallbackCdn = new URL(startUrl).hostname.split('.')[0] || 'babylonstkn';
    } catch { /* ignore */ }

    try {
        for (let hop = 0; hop < 6; hop++) {
            const res = await evoEntryRequestOnce(url, cookieMap, userAgent, referer || undefined);
            lastStatus = res.status;
            mergeEvoCookiesFromHeaders(res.headers, cookieMap);
            const sessionFromRegex = extractEvoSessionIdFromHeaders(res.headers);
            if (sessionFromRegex) cookieMap.set('EVOSESSIONID', sessionFromRegex);
            lastCookieNames = readSetCookieLines(res.headers)
                .map((line) => line.split(';')[0]?.split('=')[0]?.trim())
                .filter((name): name is string => !!name);

            if (res.location) {
                lastLocation = res.location;
                if (!tableId) tableId = parseTableIdFromEvoLocation(res.location);
            }

            const evoSessionId = cookieMap.get('EVOSESSIONID') || null;
            const cookieString = buildNolimitCookieString(cookieMap, fallbackCdn);
            const cdn = cookieMap.get('cdn') || fallbackCdn;
            const evoOrigin = `https://${cdn}.evo-games.com`;

            if (evoSessionId && tableId && cookieString) {
                return {
                    ok: true,
                    status: lastStatus,
                    location: lastLocation,
                    tableId,
                    evoSessionId,
                    cookieString,
                    cdn,
                    lang: cookieMap.get('lang') || 'fr',
                    locale: cookieMap.get('locale') || 'en',
                    fingerprint,
                    evoOrigin,
                };
            }

            if (res.status >= 300 && res.status < 400 && res.location) {
                referer = url;
                url = res.location;
                continue;
            }
            break;
        }

        const setCookieCount = lastCookieNames.length;
        return {
            ok: false,
            status: lastStatus,
            location: lastLocation,
            tableId,
            evoSessionId: cookieMap.get('EVOSESSIONID') || null,
            fingerprint,
            evoOrigin: `https://${cookieMap.get('cdn') || fallbackCdn}.evo-games.com`,
            error: !cookieMap.get('EVOSESSIONID')
                ? `EVOSESSIONID missing (set-cookie=${setCookieCount}, names=${lastCookieNames.join('|') || 'none'}, map=${[...cookieMap.keys()].join(',') || 'empty'})`
                : !tableId
                  ? `table_id missing (location=${lastLocation.slice(0, 120)})`
                  : `unexpected status ${lastStatus}`,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'request failed';
        return { ok: false, status: lastStatus, error: message };
    }
}

ipcMain.handle('nolimit-evo-entry', async (_event, configUrl: string) => nolimitFetchEvoEntry(configUrl));

ipcMain.handle('proxy-request', async (_event, { url, method = 'GET', headers = {}, body = null, followRedirects = true, freshConnection = false }) => {
    const stakeOrigin = await resolveStakeOrigin();
    // Validation logic from SwaqSlotbot (Hauptslotprojekt)
    let isAllowed = false;
    let type = '';

    if (!url || typeof url !== 'string') {
         throw new Error('Invalid url structure');
    }
    
    url = url.trim();

    // Handle relative URLs & Hacksaw Proxy (mimic SwaqSlotbot vite.config.js)
    if (url.startsWith('/api/hacksaw')) {
         // Target: https://d1oa92ndvzdrfz.cloudfront.net
         // Rewrite: /api/hacksaw -> /api
         const path = url.replace(/^\/api\/hacksaw/, '/api');
         url = 'https://d1oa92ndvzdrfz.cloudfront.net' + path;
         isAllowed = true;
         type = 'hacksaw'; 
    } else if (url.startsWith('/api/stake')) {
         // Target: https://stake.com (or stake.bet / stake.eu)
         // Rewrite: /api/stake -> /_api
         const path = url.replace(/^\/api\/stake/, '/_api');
        url = stakeOrigin + path;
         // Usually allowed by generic check, but we set it explicitly
         isAllowed = true;
         type = 'rgs'; // Standard API handling
    } else if (url.startsWith('/')) {
         // Default other relative URLs to active stake origin
        url = stakeOrigin + url;
    }

    // 1. Pragmatic Logic
    let parsedProxyUrl: URL | null = null;
    try {
        parsedProxyUrl = new URL(url);
    } catch {
        parsedProxyUrl = null;
    }
    const proxyHostname = parsedProxyUrl?.hostname || '';
    const proxyPathname = parsedProxyUrl?.pathname || '';

    if (proxyHostname && isPragmaticProxyTarget(proxyHostname, proxyPathname)) {
        isAllowed = true;
        type = 'pragmatic';
    } 
    // 2. Forum Logic
    else if (proxyHostname && hostnameMatches(proxyHostname, 'stakecommunity.com') && isAllowedForumPath(proxyPathname)) {
        isAllowed = true;
        type = 'forum';
    }
    // 3. RGS / General Provider Logic
    else {
        const allowed = [
            'stake-engine.com', 'engine.io', 'stake.com', 'evolution.com', 'stake.bet', 'stake.eu', 'evo-games.com',
            'nolimitcdn.com', 'nolimitcity.com', 'l0mpxqfj.xyz', 'thunderkick', 'relax',
            'blueprint', 'endorphina', 'netent', 'gameart', 'push', 'btg', 'oak', 'redtiger',
            'playngo', 'octoplay', 'peterandsons', 'shady', 'shuffle', 'titan', 'twist',
            'popiplay', 'helio', 'samurai', '1000lakes', 'hacksawgaming.com', 'rgs-social.hacksawgaming.com',
            'static-live.hacksawgaming.com', 'd1oa92ndvzdrfz.cloudfront.net',
            'api.clawbuster.com', 'clawbuster-cdn.com', 'gsplauncher.de',
            'hub88-2-playnetic.com', 'playnetic.com',
            // Mascot launcher/runtime hosts (e.g. open.mascot.host -> <session>.mascot.games)
            'mascot.host', 'mascot.games',
            // Truelab / Stake third-party: startThirdPartySession config → grandgames launcher, RGS play.launcher-gg.com
            'grandgames.io', 'launcher-gg.com',
            // BGaming Softswiss RGS (HAR: {game}.bgaming-network.com/api + {game}.gamma.bgaming-network.com)
            'bgaming-network.com',
            'apicdn.sanity.io',
            'cdn.sanity.io',
            'sta.ke',
        ];
        if (proxyHostname && allowed.some(h => hostnameMatches(proxyHostname, h))) {
            isAllowed = true;
            type = 'rgs';
        }
    }

    if (!isAllowed) {
        console.error('Proxy Request Blocked: Invalid URL', url);
        throw new Error('Invalid url');
    }

    // Node https statt net.request – umgeht ERR_BLOCKED_BY_CLIENT (Adblocker/Session)
    const requestHeaders: Record<string, string> = { ...headers };
    const isStakeTarget = isStakeOriginUrl(url);
    let requestStakeOrigin = stakeOrigin;
    try {
        requestStakeOrigin = new URL(url).origin;
    } catch {
        requestStakeOrigin = stakeOrigin;
    }

    if (isStakeTarget) {
        if (!requestHeaders['Cookie']) {
            try {
                const cookies = await session.defaultSession.cookies.get({ url });
                const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
                if (header) requestHeaders['Cookie'] = header;
                else if (sessionData.cookies) requestHeaders['Cookie'] = sessionData.cookies;
            } catch {
                if (sessionData.cookies) requestHeaders['Cookie'] = sessionData.cookies;
            }
        }
        if (!requestHeaders['Origin']) {
            requestHeaders['Origin'] = requestStakeOrigin;
        }
        if (!requestHeaders['Referer']) {
            requestHeaders['Referer'] = `${requestStakeOrigin}/`;
        }
        if (!requestHeaders['Accept']) {
            requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
        }
        if (!requestHeaders['Accept-Language']) {
            requestHeaders['Accept-Language'] = 'en-US,en;q=0.9,de;q=0.8';
        }
    }

    // Pragmatic: Cookies über playGame→game/load→SingleSessionAPI hinweg (Stake.eu Shell).
    if (!isStakeTarget && !requestHeaders['Cookie'] && parsedProxyUrl) {
      try {
        const cookies = await session.defaultSession.cookies.get({ url });
        const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        if (header) requestHeaders['Cookie'] = header;
      } catch {
        /* ignore */
      }
    }

    return new Promise((resolve, reject) => {
        if (type === 'pragmatic') {
            try {
                const urlObj = new URL(url);
                const origin = `${urlObj.protocol}//${urlObj.host}`;
                if (method === 'GET' && url.includes('playGame.do')) {
                    requestHeaders['Origin'] = stakeOrigin;
                    requestHeaders['Referer'] = `${stakeOrigin}/casino/home`;
                } else {
                    if (!requestHeaders['Origin']) requestHeaders['Origin'] = origin;
                    if (!requestHeaders['Referer']) {
                      requestHeaders['Referer'] =
                        method === 'GET' ? url : `${origin}/gs2c/html5Game.do`;
                    }
                }
                if (body && method !== 'GET') {
                    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/x-www-form-urlencoded';
                }
            } catch (e) {
                console.error('Pragmatic URL parse error', e);
            }
        } else if (type === 'forum') {
            const ref = requestHeaders['Referer'] && requestHeaders['Referer'].startsWith('http')
              ? requestHeaders['Referer']
              : `${FORUM_ORIGIN}/`;
            const forumHdrs = forumDefaultFetchHeaders(ref);
            for (const [k, v] of Object.entries(forumHdrs)) {
              if (!requestHeaders[k]) requestHeaders[k] = v;
            }
        } else if (type === 'hacksaw') {
            const urlObj = new URL(url);
            const origin = `${urlObj.protocol}//${urlObj.host}`;
            requestHeaders['Origin'] = origin;
            requestHeaders['Referer'] = origin + '/';
            if (!requestHeaders['Content-Type']) {
                requestHeaders['Content-Type'] = 'application/json';
            }
        } else if (type === 'rgs') {
            if (method !== 'GET' && !requestHeaders['Content-Type']) {
                requestHeaders['Content-Type'] = 'application/json';
            }
        }

        if (!requestHeaders['User-Agent']) {
            // Prefer session UA, else Chrome-like fallback (Electron UA often CF-blocked on RGS hosts).
            requestHeaders['User-Agent'] = sessionData.userAgent || STAKE_BROWSER_USER_AGENT;
        }

        const bodyStr =
            body === undefined || body === null
                ? undefined
                : typeof body === 'object' && !Buffer.isBuffer(body)
                  ? JSON.stringify(body)
                  : String(body);
        if (bodyStr !== undefined && method !== 'GET' && method !== 'HEAD') {
          if (!requestHeaders['Content-Length'] && !requestHeaders['content-length']) {
            requestHeaders['Content-Length'] = String(Buffer.byteLength(bodyStr));
          }
        }

        function doRequest(targetUrl: string, redirectCount = 0): void {
            const urlParsed = new URL(targetUrl);
            const isHttps = urlParsed.protocol === 'https:';
            const client = isHttps ? https : http;
            const useFreshAgent = freshConnection && redirectCount === 0;
            const freshHttpAgent = useFreshAgent ? new http.Agent({ keepAlive: false, maxSockets: 1, maxFreeSockets: 0 }) : null;
            const freshHttpsAgent = useFreshAgent ? new https.Agent({ keepAlive: false, maxSockets: 1, maxFreeSockets: 0 }) : null;
            const requestAgent = useFreshAgent
                ? (isHttps ? freshHttpsAgent! : freshHttpAgent!)
                : (isHttps ? PROXY_HTTPS_AGENT : PROXY_HTTP_AGENT);
            const opts: https.RequestOptions = {
                method: redirectCount > 0 ? 'GET' : method,
                hostname: urlParsed.hostname,
                port: urlParsed.port || (isHttps ? 443 : 80),
                path: urlParsed.pathname + urlParsed.search,
                headers: redirectCount > 0 ? { ...requestHeaders, Origin: urlParsed.origin, Referer: targetUrl } : requestHeaders,
                agent: requestAgent,
            };

            const destroyFreshAgents = () => {
                if (!useFreshAgent) return;
                try { freshHttpAgent?.destroy(); } catch { /* ignore */ }
                try { freshHttpsAgent?.destroy(); } catch { /* ignore */ }
            };

            const req = client.request(opts, (res) => {
                const chunks: Buffer[] = [];
                let total = 0;
                let abortedForSize = false;
                res.on('data', (chunk: Buffer) => {
                    total += chunk.length;
                    if (total > MAX_IPC_RESPONSE_BYTES) {
                        abortedForSize = true;
                        req.destroy(new Error(`Proxy response too large (> ${MAX_IPC_RESPONSE_BYTES} bytes).`));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    if (abortedForSize) return;
                    void (async () => {
                    const data = await decodeProxyResponseBody(chunks, res.headers['content-encoding']);
                    const loc = res.headers['location'] as string | undefined;
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
                        const resolvedLoc = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
                        if (!followRedirects) {
                            destroyFreshAgents();
                            resolve({
                                status: res.statusCode || 0,
                                statusText: res.statusMessage || '',
                                headers: normalizeOutgoingProxyHeaders(res.headers),
                                data,
                                finalUrl: resolvedLoc,
                            });
                            return;
                        }
                        if (redirectCount < 5) {
                            // Pragmatic playGame→game/load setzt Session-Cookies auf dem 302;
                            // ohne Jar liefert game/load kein mgckey (Stake.eu shell).
                            const setCookieLines = readSetCookieLines(res.headers);
                            if (setCookieLines.length) {
                              const prevCookie =
                                typeof requestHeaders['Cookie'] === 'string'
                                  ? requestHeaders['Cookie']
                                  : typeof requestHeaders['cookie'] === 'string'
                                    ? requestHeaders['cookie']
                                    : undefined;
                              const merged = mergeSetCookieIntoCookieHeader(prevCookie, setCookieLines);
                              if (merged) {
                                requestHeaders['Cookie'] = merged;
                                delete requestHeaders['cookie'];
                              }
                              void persistProxySetCookies(targetUrl, res.headers);
                            }
                            destroyFreshAgents();
                            return doRequest(resolvedLoc, redirectCount + 1);
                        }
                    }
                    if (res.statusCode === 403 && isStakeOriginUrl(targetUrl)) {
                        stakeBrowserGetText(targetUrl, requestHeaders)
                            .then((fallback) => {
                                destroyFreshAgents();
                                resolve({
                                    status: fallback.status || 403,
                                    statusText: fallback.status === 200 ? 'OK (browser-fallback)' : (res.statusMessage || ''),
                                    headers: normalizeOutgoingProxyHeaders(res.headers),
                                    data: fallback.body,
                                    finalUrl: fallback.finalUrl || targetUrl,
                                });
                            })
                            .catch((fallbackErr) => {
                                console.warn('[StakeSession] proxy-request 403 fallback failed', fallbackErr);
                                destroyFreshAgents();
                                resolve({
                                    status: res.statusCode || 0,
                                    statusText: res.statusMessage || '',
                                    headers: normalizeOutgoingProxyHeaders(res.headers),
                                    data,
                                    finalUrl: targetUrl,
                                });
                            });
                        return;
                    }
                    destroyFreshAgents();
                    void persistProxySetCookies(targetUrl, res.headers);
                    resolve({
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        headers: normalizeOutgoingProxyHeaders(res.headers),
                        data,
                        finalUrl: loc && res.statusCode && res.statusCode >= 300 && res.statusCode < 400
                            ? (loc.startsWith('http') ? loc : new URL(loc, targetUrl).href)
                            : targetUrl,
                    });
                    })().catch((err) => {
                        destroyFreshAgents();
                        reject(err);
                    });
                });
            });

            req.on('error', (err) => {
                destroyFreshAgents();
                console.error('Proxy Request Error:', err);
                reject(err);
            });

            if (bodyStr && redirectCount === 0) req.write(bodyStr);
            req.end();
        }

        doRequest(url);
    });
});

// Telegram (GramJS): eigenes Konto / Kanal-Nachrichten laden
ipcMain.handle('telegram-config-get', async () => loadTelegramConfig());
ipcMain.handle(
  'telegram-config-set',
  async (_event, payload: { apiId: number; apiHash: string }) => {
    if (!payload?.apiHash || typeof payload.apiId !== 'number') {
      return { ok: false as const, error: 'Ungültige API-Daten.' };
    }
    saveTelegramConfig({ apiId: payload.apiId, apiHash: payload.apiHash.trim() });
    return { ok: true as const };
  }
);
ipcMain.handle(
  'telegram-login',
  async (
    event,
    payload: { phone: string; apiId: number; apiHash: string }
  ) => {
    const { phone, apiId, apiHash } = payload;
    const notify = (channel: string, ...args: unknown[]) => {
      event.sender.send(channel, ...args);
    };
    return telegramLogin({ apiId, apiHash: apiHash.trim() }, phone, notify);
  }
);
ipcMain.handle('telegram-submit-auth-code', async (_event, code: string) => {
  submitAuthCode(typeof code === 'string' ? code : '');
});
ipcMain.handle('telegram-submit-auth-password', async (_event, password: string) => {
  submitAuthPassword(typeof password === 'string' ? password : '');
});
ipcMain.handle('telegram-status', async () => telegramStatus());
ipcMain.handle(
  'telegram-fetch-messages',
  async (_event, payload: { channel: string; limit?: number }) => {
    if (!payload?.channel || typeof payload.channel !== 'string') {
      return { ok: false as const, error: 'Kanal fehlt.' };
    }
    return telegramFetchChannelMessages(payload.channel, payload.limit ?? 30);
  }
);
ipcMain.handle('telegram-logout', async () => {
  await telegramLogout();
});

ipcMain.handle('telegram-listen-start', async (event, payload: { channel: string }) => {
  const ch = typeof payload?.channel === 'string' ? payload.channel.trim() : '';
  if (!ch) return { ok: false as const, error: 'Kanal fehlt.' };
  const notify = (channel: string, ...args: unknown[]) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, ...args);
  };
  return telegramStartListen(ch, notify);
});
ipcMain.handle('telegram-listen-stop', async () => {
  await telegramStopListen();
  return { ok: true as const };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    destroyAuxiliaryBrowserWindows();
    app.quit();
  }
});

app.on('before-quit', () => {
  destroyAuxiliaryBrowserWindows();
});

app.on('will-quit', () => {
  if (SESSION_ONLY_BET_LOGS) {
    clearAllBetLogs();
  }
  globalShortcut.unregisterAll();
  destroyAuxiliaryBrowserWindows();
  for (const bw of BrowserWindow.getAllWindows()) {
    if (!bw.isDestroyed()) {
      try {
        bw.destroy();
      } catch {
        /* ignore */
      }
    }
  }
  try {
    PROXY_HTTP_AGENT.destroy();
    PROXY_HTTPS_AGENT.destroy();
  } catch {
    /* ignore */
  }
  void shutdownTelegramForAppQuit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.swqbot.electron');
    }

    if (FRAMELESS_CHROME) {
      Menu.setApplicationMenu(null);
    }
    registerWindowChromeIpc();
    applyDefaultSessionUserAgent();

    session.defaultSession.cookies.on(
      'changed',
      (
        _event: Electron.Event,
        cookie: Electron.Cookie,
        cause: string,
        removed: boolean
      ) => {
        const domain = String(cookie.domain || '').toLowerCase();
        const isStakeCookie =
          domain.includes('stake.com') || domain.includes('stake.bet') || domain.includes('stake.eu');
        if (!isStakeCookie) return;
        if (!STAKE_COOKIE_DEBUG_NAMES.has(String(cookie.name || ''))) return;
        invalidateStakeSessionStatusCache();
        void captureSession().catch(() => {});
        console.log('[StakeSession] Cookie changed', {
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          cause,
          removed,
        });
      }
    );

    // Inject headers for requests to Stake origins from Renderer (if any)
    session.defaultSession.webRequest.onBeforeSendHeaders(
      {
        urls: [
          '*://stake.com/*',
          '*://*.stake.com/*',
          '*://stake.bet/*',
          '*://*.stake.bet/*',
          '*://stake.eu/*',
          '*://*.stake.eu/*',
        ],
      },
      (
        details: { url: string; requestHeaders: Record<string, string> },
        callback: (response: { requestHeaders: Record<string, string> }) => void
      ) => {
        if (isStakeOriginUrl(details.url)) {
          try {
            const u = new URL(details.url);
            const origin = `${u.protocol}//${u.host}`;
            details.requestHeaders['Origin'] = origin;
            details.requestHeaders['Referer'] = `${origin}/`;
            details.requestHeaders['User-Agent'] = STAKE_BROWSER_USER_AGENT;
            Object.assign(details.requestHeaders, stakeClientHintHeaders());
          } catch {
            // ignore parse errors and keep existing headers
          }
        }
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    if (SESSION_ONLY_BET_LOGS) {
      clearAllBetLogs();
    }

    createWindow();
    createTray();

    if (app.isPackaged) {
      configureGithubAutoUpdater();
      const runUpdateCheck = () => {
        console.log('[Updater] Checking for updates…');
        checkForUpdatesWithRetry().catch((e) => logger.error('[Updater] check failed:', e));
      };
      // Kurz verzögern: Fenster/Netzwerk nach Start (Renderer prüft zusätzlich nach 2 s).
      setTimeout(runUpdateCheck, 8000);
    }
});


