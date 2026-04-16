import { app, BrowserWindow, ipcMain, net, session, shell, globalShortcut, dialog, type WebContents } from 'electron';
import https from 'node:https';
import http from 'node:http';
import updater from 'electron-updater';
const { autoUpdater } = updater;
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
let slotPopupSeq = 0;

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
          reject(new Error(`API response too large (> ${MAX_IPC_RESPONSE_BYTES} bytes).`));
          return;
        }
        const body = Buffer.concat(chunks).toString();
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 403) {
          reject(new StakeHttpError(status, body, `Session rejected (${status})`));
          return;
        }
        if (status === 429) {
          reject(new StakeHttpError(status, body, 'API rate limited (429). Bitte kurz warten und erneut versuchen.'));
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          reject(new StakeHttpError(status, body, `API antwortete nicht mit JSON (HTTP ${status}).`));
          return;
        }
        if (status >= 400) {
          reject(
            new StakeHttpError(status, body, `HTTP ${status}: ${extractStakeJsonErrorMessage(parsed)}`)
          );
          return;
        }
        resolve({ status, body, parsed });
      });
    });

    request.on('error', (error) => {
      reject(error);
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

function appendBetLog(entry: unknown): string {
  const filePath = getBetLogPathForDate();
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
  return filePath;
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
      webSecurity: false,
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
    shell.openExternal(url);
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

// --- Auto Updater Logic ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

import logger from 'electron-log';
autoUpdater.logger = logger;
(autoUpdater.logger as any).transports.file.level = 'info';

// Prevent downgrade
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

ipcMain.handle('check-for-updates', () => {
    if (!app.isPackaged) {
        console.log('[Updater] Skipping check in dev mode');
        return;
    }
    autoUpdater.checkForUpdates();
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
    await shell.openExternal(url);
});

ipcMain.handle('open-slot-popup', async (event, payload: { slug?: string; locale?: string } = {}) => {
    const rawSlug = String(payload?.slug || '').trim().toLowerCase();
    const slug = rawSlug.replace(/[^a-z0-9-]/g, '');
    if (!slug) return { ok: false, error: 'invalid_slug' };

    const localeRaw = String(payload?.locale || 'de').trim().toLowerCase();
    const locale = /^[a-z]{2}(-[a-z]{2})?$/.test(localeRaw) ? localeRaw : 'de';
    const origin = await resolveStakeOrigin();
    const targetUrl = `${origin}/${locale}/casino/games/${slug}`;
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
        shell.openExternal(url);
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
            shell.openExternal(url);
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

ipcMain.handle('logger-save-bet', (_event, entry: any) => {
    if (!entry || (entry.houseId == null && entry.iid == null && entry.betId == null && entry.receivedAt == null)) return null;
    return appendBetLog(entry);
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
    for (const entry of bets) {
        const filePath = getBetLogPathForDate(entry.receivedAt);
        fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    }
    return { ok: true, bets, saved: true };
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

ipcMain.handle('api-request', async (_event, payload) => {
    const { query, variables, operationName } = payload;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < STAKE_MAX_AUTH_RETRIES; attempt++) {
        const forceCheck = attempt > 0;
        try {
            const sessionStatus = await ensureValidStakeSession(forceCheck);
            throwIfSessionInvalid(sessionStatus);
            const origin = sessionStatus.origin;
            const tokenModes: Array<'with_token' | 'without_token'> = sessionStatus.sessionToken
                ? ['with_token', 'without_token']
                : ['without_token'];
            for (const tokenMode of tokenModes) {
                try {
                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/plain, */*',
                        Origin: origin,
                        Referer: `${origin}/`,
                        'x-operation-name': String(operationName || ''),
                        'User-Agent': sessionStatus.userAgent || 'Mozilla/5.0',
                    };
                    if (tokenMode === 'with_token' && sessionStatus.sessionToken) {
                        headers['x-access-token'] = sessionStatus.sessionToken;
                    }
                    let response;
                    try {
                        response = await stakeNetPostJson(`${origin}/_api/graphql`, headers, {
                            query,
                            variables,
                        });
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
                            response = await stakeBrowserPostJson(`${origin}/_api/graphql`, headers, {
                                query,
                                variables,
                            });
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
                openLoginWindowForRejectedSession(`api-request ${error.status}`);
                throw new Error(`Session rejected (${error.status}). Login window opened.`);
            }
            if (String((error as Error)?.message || '').includes('Session rejected')) {
                invalidateStakeSessionStatusCache();
                if (attempt + 1 < STAKE_MAX_AUTH_RETRIES) continue;
                openLoginWindowForRejectedSession('api-request session invalid');
                throw new Error('Session rejected. Login window opened.');
            }
            throw error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('API request failed');
});

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
        if (url.includes('gcmlgxrmkp.net')) {
            isAllowed = true;
            type = 'pragmatic';
        } 
        // 2. Forum Logic
        else if (url.includes('stakecommunity.com/topic/')) {
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
                'mascot.host', 'mascot.games'
            ];
            if (allowed.some(h => url.includes(h))) {
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
            requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
            requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
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

    createWindow();

    if (app.isPackaged) {
        console.log('[Updater] App is packaged, checking for updates...');
        autoUpdater.checkForUpdates();
    }
});


