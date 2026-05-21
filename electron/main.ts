import { app, BrowserWindow, ipcMain, net, session, shell, globalShortcut, dialog, type WebContents } from 'electron';
// electron-updater ist CommonJS: Named Import `import { autoUpdater }` bricht unter ESM (Main-Prozess).
import updaterModule from 'electron-updater';
const { autoUpdater } = updaterModule;
import logger from 'electron-log';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';
import os from 'os';
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
  getStakeSessionStatus,
  invalidateStakeSessionStatusCache,
  isStakeOriginUrl,
  resolveStakeOrigin,
  type StakeSessionStatus,
} from './stakeSessionManager.js';

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
let stakeBridgeWin: BrowserWindow | null = null;
let withdrawPrefillWin: BrowserWindow | null = null;
let forumLoginWin: BrowserWindow | null = null;
let slotPopupSeq = 0;

/** Stake Community forum (IPS) – same pattern as Appeals Monitor: isolated partition + session.fetch. */
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

function hostnameMatches(hostname: string, allowed: string): boolean {
  const host = hostname.toLowerCase();
  const needle = allowed.toLowerCase();
  if (!needle) return false;
  if (needle.includes('.')) return host === needle || host.endsWith(`.${needle}`);
  return host.split('.').some((part) => part.includes(needle));
}

/** Pragmatic / Fat Panda / Sexy Rabbit gs2c hosts (Stake liefert rotierende CDN-Subdomains). */
const PRAGMATIC_HOST_SUFFIXES = ['gcmlgxrmkp.net', 'ukffjfmmka.net', 'iumtibif.net'] as const;

function isPragmaticProxyTarget(hostname: string, pathname: string): boolean {
  if (!hostname) return false;
  if (PRAGMATIC_HOST_SUFFIXES.some((suffix) => hostnameMatches(hostname, suffix))) return true;
  // playGame.do auf stake.com läuft über rgs — nicht als Pragmatic-CDN behandeln
  if (
    hostnameMatches(hostname, 'stake.com') ||
    hostnameMatches(hostname, 'stake.bet') ||
    hostnameMatches(hostname, 'stake-engine.com')
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
  if (now - lastLoginWindowOpenAt < LOGIN_WINDOW_DEBOUNCE_MS) {
    return;
  }
  lastLoginWindowOpenAt = now;
  console.warn('[StakeSession] Opening login window due to rejected session:', reason);
  createLoginWindow();
}

async function ensureStakeBridgeWindow(origin: string): Promise<BrowserWindow> {
  if (stakeBridgeWin && !stakeBridgeWin.isDestroyed()) {
    return stakeBridgeWin;
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
  await stakeBridgeWin.loadURL(`${origin}/`);
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

function getBetLogPathForDate(isoDateStr?: string): string {
  const dateStr = isoDateStr ? String(isoDateStr).slice(0, 10) : new Date().toISOString().slice(0, 10);
  return path.join(getBetLogsDir(), `bets-${dateStr}.jsonl`);
}

async function appendBetLog(entry: unknown): Promise<string> {
  const filePath = getBetLogPathForDate();
  await fs.promises.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');
  return filePath;
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

function createWindow() {
  const iconPngPath = path.join(VITE_PUBLIC, 'icon.png');
  const iconSvgPath = path.join(VITE_PUBLIC, 'favicon.svg');
  const resolvedIconPath = fs.existsSync(iconPngPath) ? iconPngPath : iconSvgPath;

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'StakeSports',
    autoHideMenuBar: true,
    icon: resolvedIconPath,
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

function createLoginWindow() {
    if (loginWin) {
        loginWin.focus();
        return;
    }

    loginWin = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: win || undefined,
        modal: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    loginWin.loadURL('https://stake.com');

    loginWin.on('closed', () => {
        loginWin = null;
    });

    // Capture session data when navigating
    loginWin.webContents.on('did-navigate', async () => {
        invalidateStakeSessionStatusCache();
        await captureSession();
    });
    loginWin.webContents.on('did-finish-load', async () => {
        invalidateStakeSessionStatusCache();
        await captureSession();
    });
}

// --- Auto Updater (electron-updater / GitHub Releases + latest.yml) ---
/** Muss zu package.json → build.publish und zu veröffentlichten Releases passieren. */
const UPDATER_GITHUB = { owner: 'swqstake-bot', repo: 'sportslots' } as const;
/** Keep in sync with src/config/sessionData.ts — legacy JSONL cleared on start + quit. */
const SESSION_ONLY_BET_LOGS = true;

function configureGithubAutoUpdater(): void {
  if (!app.isPackaged) return;
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: UPDATER_GITHUB.owner,
      repo: UPDATER_GITHUB.repo,
      releaseType: 'release',
    });
    logger.info('[Updater] GitHub feed:', `${UPDATER_GITHUB.owner}/${UPDATER_GITHUB.repo}`);
  } catch (e) {
    logger.warn('[Updater] setFeedURL failed:', e);
  }
}

// Production: Update im Hintergrund laden; Installation weiterhin über „Neustart“ (oder Quit).
autoUpdater.autoDownload = app.isPackaged;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = logger;
(autoUpdater.logger as any).transports.file.level = 'info';
autoUpdater.allowDowngrade = false;

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...');
  logger.info('[Updater] Checking for update...');
  win?.webContents.send('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info);
  logger.info('[Updater] Update available:', info);
  win?.webContents.send('update-status', { status: 'available', info });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[Updater] Update not available:', info);
  logger.info('[Updater] Update not available:', info);
  win?.webContents.send('update-status', { status: 'not-available', info });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Error:', err);
  logger.error('[Updater] Error:', err);
  win?.webContents.send('update-status', { status: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  win?.webContents.send('update-status', { status: 'downloading', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
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
  configureGithubAutoUpdater();
  try {
    const result = await autoUpdater.checkForUpdates();
    return { skipped: false as const, result };
  } catch (e) {
    logger.error('[Updater] checkForUpdates:', e);
    throw e;
  }
});

ipcMain.handle('start-download', () => {
    autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});
// --------------------------

// IPC Handlers
ipcMain.handle('login', () => {
    createLoginWindow();
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
                openLoginWindowForRejectedSession(`${contextLabel} ${error.status}`);
                throw new Error(`Session rejected (${error.status}). Login window opened.`);
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
  async (_event, payload: { url: string; referer?: string }) => {
    const url = String(payload?.url || '').trim();
    if (!url.includes('stakecommunity.com/topic/')) {
      return {
        ok: false as const,
        skipped: false as const,
        error: 'invalid_url',
        status: 0,
        statusText: '',
        data: '',
        finalUrl: '',
      };
    }
    const ses = session.fromPartition(FORUM_SESSION_PARTITION);
    const cookies = await ses.cookies.get({ url: FORUM_ORIGIN });
    if (!cookies.length) {
      return {
        ok: false as const,
        skipped: true as const,
        error: 'no_forum_session',
        status: 0,
        statusText: '',
        data: '',
        finalUrl: '',
      };
    }
    const referer =
      typeof payload?.referer === 'string' && payload.referer.startsWith('http') ? payload.referer : `${FORUM_ORIGIN}/`;
    try {
      const res = await ses.fetch(url, {
        method: 'GET',
        headers: forumDefaultFetchHeaders(referer),
      });
      const data = await res.text();
      return {
        ok: true as const,
        skipped: false as const,
        status: res.status,
        statusText: res.statusText || '',
        data,
        finalUrl: res.url || url,
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
      };
    }
  }
);

ipcMain.handle('proxy-request', async (_event, { url, method = 'GET', headers = {}, body = null }) => {
    const stakeOrigin = await resolveStakeOrigin();
    return new Promise((resolve, reject) => {
        // Validation logic from SwaqSlotbot (Hauptslotprojekt)
        let isAllowed = false;
        let type = '';

        if (!url || typeof url !== 'string') {
             return reject(new Error('Invalid url structure'));
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
             // Target: https://stake.com (or stake.bet)
             // Rewrite: /api/stake -> /_api
             const path = url.replace(/^\/api\/stake/, '/_api');
            url = stakeOrigin + path;
             // Usually allowed by generic check, but we set it explicitly
             isAllowed = true;
             type = 'rgs'; // Standard API handling
        } else if (url.startsWith('/')) {
             // Default other relative URLs to stake.com
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
        else if (proxyHostname && hostnameMatches(proxyHostname, 'stakecommunity.com') && proxyPathname.startsWith('/topic/')) {
            isAllowed = true;
            type = 'forum';
        }
        // 3. RGS / General Provider Logic
        else {
            const allowed = [
                'stake-engine.com', 'stake.com', 'evolution.com', 'stake.bet', 'evo-games.com',
                'nolimitcdn.com', 'nolimitcity.com', 'l0mpxqfj.xyz', 'thunderkick', 'relax',
                'blueprint', 'endorphina', 'netent', 'gameart', 'push', 'btg', 'oak', 'redtiger',
                'playngo', 'octoplay', 'peterandsons', 'shady', 'shuffle', 'titan', 'twist',
                'popiplay', 'helio', 'samurai', '1000lakes', 'hacksawgaming.com', 'd1oa92ndvzdrfz.cloudfront.net',
                'api.clawbuster.com', 'clawbuster-cdn.com', 'gsplauncher.de',
                // Mascot launcher/runtime hosts (e.g. open.mascot.host -> <session>.mascot.games)
                'mascot.host', 'mascot.games',
                // Truelab / Stake third-party: startThirdPartySession config → grandgames launcher, RGS play.launcher-gg.com
                'grandgames.io', 'launcher-gg.com',
            ];
            if (proxyHostname && allowed.some(h => hostnameMatches(proxyHostname, h))) {
                isAllowed = true;
                type = 'rgs';
            }
        }

        if (!isAllowed) {
            console.error('Proxy Request Blocked: Invalid URL', url);
            return reject(new Error('Invalid url'));
        }

        // Node https statt net.request – umgeht ERR_BLOCKED_BY_CLIENT (Adblocker/Session)
        const requestHeaders: Record<string, string> = { ...headers };
        const isStakeTarget = isStakeOriginUrl(url);

        if (isStakeTarget) {
            if (sessionData.cookies && !requestHeaders['Cookie']) {
                requestHeaders['Cookie'] = sessionData.cookies;
            }
            if (!requestHeaders['Origin']) {
                requestHeaders['Origin'] = stakeOrigin;
            }
            if (!requestHeaders['Referer']) {
                requestHeaders['Referer'] = `${stakeOrigin}/`;
            }
            if (!requestHeaders['Accept']) {
                requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            }
            if (!requestHeaders['Accept-Language']) {
                requestHeaders['Accept-Language'] = 'en-US,en;q=0.9,de;q=0.8';
            }
        }

        if (type === 'pragmatic') {
            try {
                const urlObj = new URL(url);
                const origin = `${urlObj.protocol}//${urlObj.host}`;
                if (method === 'GET' && url.includes('playGame.do')) {
                    requestHeaders['Origin'] = 'https://stake.bet';
                    requestHeaders['Referer'] = 'https://stake.bet/casino/home';
                } else {
                    requestHeaders['Origin'] = origin;
                    requestHeaders['Referer'] = method === 'GET' ? url : `${origin}/gs2c/html5Game.do`;
                }
                if (body && method !== 'GET') {
                    requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
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

        if (!requestHeaders['User-Agent'] && sessionData.userAgent) {
            requestHeaders['User-Agent'] = sessionData.userAgent;
        }

        const bodyStr = body
            ? (typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body)
            : undefined;

        function doRequest(targetUrl: string, redirectCount = 0): void {
            const urlParsed = new URL(targetUrl);
            const isHttps = urlParsed.protocol === 'https:';
            const client = isHttps ? https : http;
            const opts: https.RequestOptions = {
                method: redirectCount > 0 ? 'GET' : method,
                hostname: urlParsed.hostname,
                port: urlParsed.port || (isHttps ? 443 : 80),
                path: urlParsed.pathname + urlParsed.search,
                headers: redirectCount > 0 ? { ...requestHeaders, Origin: urlParsed.origin, Referer: targetUrl } : requestHeaders,
                agent: isHttps ? PROXY_HTTPS_AGENT : PROXY_HTTP_AGENT,
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
                    const data = Buffer.concat(chunks).toString();
                    const loc = res.headers['location'] as string | undefined;
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc && redirectCount < 5) {
                        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
                        return doRequest(nextUrl, redirectCount + 1);
                    }
                    if (res.statusCode === 403 && isStakeOriginUrl(targetUrl)) {
                        stakeBrowserGetText(targetUrl, requestHeaders)
                            .then((fallback) => {
                                resolve({
                                    status: fallback.status || 403,
                                    statusText: fallback.status === 200 ? 'OK (browser-fallback)' : (res.statusMessage || ''),
                                    headers: res.headers,
                                    data: fallback.body,
                                    finalUrl: fallback.finalUrl || targetUrl,
                                });
                            })
                            .catch((fallbackErr) => {
                                console.warn('[StakeSession] proxy-request 403 fallback failed', fallbackErr);
                                resolve({
                                    status: res.statusCode || 0,
                                    statusText: res.statusMessage || '',
                                    headers: res.headers,
                                    data,
                                    finalUrl: targetUrl,
                                });
                            });
                        return;
                    }
                    resolve({
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        headers: res.headers,
                        data,
                        finalUrl: loc && res.statusCode && res.statusCode >= 300 && res.statusCode < 400
                            ? (loc.startsWith('http') ? loc : new URL(loc, targetUrl).href)
                            : targetUrl,
                    });
                });
            });

            req.on('error', (err) => {
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
    session.defaultSession.cookies.on(
      'changed',
      (
        _event: Electron.Event,
        cookie: Electron.Cookie,
        cause: string,
        removed: boolean
      ) => {
        const domain = String(cookie.domain || '').toLowerCase();
        const isStakeCookie = domain.includes('stake.com') || domain.includes('stake.bet');
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
      { urls: ['*://stake.com/*', '*://*.stake.com/*', '*://stake.bet/*', '*://*.stake.bet/*'] },
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

    if (app.isPackaged) {
      configureGithubAutoUpdater();
      const runUpdateCheck = () => {
        console.log('[Updater] Checking for updates…');
        autoUpdater.checkForUpdates().catch((e) => logger.error('[Updater] check failed:', e));
      };
      // Kurz verzögern: Fenster/Netzwerk nach Start (Renderer prüft zusätzlich nach 2 s).
      setTimeout(runUpdateCheck, 8000);
    }
});


