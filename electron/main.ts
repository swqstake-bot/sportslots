import { app, BrowserWindow, ipcMain, net, session, shell, globalShortcut, dialog } from 'electron';
import https from 'node:https';
import http from 'node:http';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';
import os from 'os';
import { DIST, VITE_PUBLIC, SPIN_SAMPLES_DIR, FIRST_SLOT_WINS_DIR, VITE_DEV_SERVER_URL, ELECTRON_DIR } from './config.js';
import { sessionData, captureSession } from './sessionCapture.js';

/** Stake-Session: bevorzugt stake.com, sonst stake.bet (Cookie vorhanden). */
async function resolveStakeOrigin(): Promise<string> {
    await captureSession();
    try {
        const forCom = await session.defaultSession.cookies.get({ url: 'https://stake.com' });
        const forBet = await session.defaultSession.cookies.get({ url: 'https://stake.bet' });
        const hasCom = forCom.some((c) => c.name === 'session' && String(c.value || '').length > 0);
        const hasBet = forBet.some((c) => c.name === 'session' && String(c.value || '').length > 0);
        if (hasBet && !hasCom) return 'https://stake.bet';
    } catch {
        /* ignore */
    }
    return 'https://stake.com';
}

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
  loadTelegramConfig,
  saveTelegramConfig,
} from './telegramUser.js';

let win: BrowserWindow | null;
let loginWin: BrowserWindow | null;
const MAX_IPC_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB safety cap for IPC responses

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
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(VITE_PUBLIC, 'icon.png'),
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

  console.log('Loading URL:', VITE_DEV_SERVER_URL);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
    win.webContents.session.clearCache().then(() => {
        console.log('Cache cleared!');
    });
  } else {
    // Production
    win.loadFile(path.join(DIST, 'index.html'));
  }

  // F12: DevTools öffnen/schließen (Dev + Production)
  const toggleDevTools = () => {
    win?.webContents.toggleDevTools();
  };
  globalShortcut.register('F12', toggleDevTools);
  globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);

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

ipcMain.handle('get-session-token', async () => {
    if (!sessionData.cookies) {
        await captureSession();
    }
    const sessionTokenMatch = sessionData.cookies.match(/session=([^;]+)/);
    return sessionTokenMatch ? sessionTokenMatch[1] : null;
});

/** WebSocket muss dieselbe Stake-Origin wie die Session nutzen (stake.bet vs stake.com). */
ipcMain.handle('get-stake-ws-url', async () => {
    const origin = await resolveStakeOrigin();
    return origin.replace(/^https/, 'wss') + '/_api/websockets';
});

ipcMain.handle('logger-fetch-currency-rates', async () => {
    try {
        await captureSession();
        const origin = await resolveStakeOrigin();
        const res = await fetch(`${origin}/_api/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: sessionData.cookies || '',
                'User-Agent': sessionData.userAgent || 'Mozilla/5.0',
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
    
    // Ensure we have the latest session data
    if (!sessionData.cookies) {
        await captureSession();
    }

    return new Promise((resolve, reject) => {
        const request = net.request({
            method: 'POST',
            url: 'https://stake.com/_api/graphql',
            useSessionCookies: true, // IMPORTANT: Use the Electron session cookies automatically
        });

        request.setHeader('Content-Type', 'application/json');
        
        // Extract session token from cookies if available, otherwise empty string
        const sessionTokenMatch = sessionData.cookies.match(/session=([^;]+)/);
        const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : '';
        request.setHeader('x-access-token', sessionToken);
        
        // Add mimicry headers
        request.setHeader('Origin', 'https://stake.com');
        request.setHeader('Referer', 'https://stake.com/');
        request.setHeader('x-operation-name', operationName || '');
        if (sessionData.userAgent) {
            request.setHeader('User-Agent', sessionData.userAgent);
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
                const trimmed = body.trim();

                if (status === 401 || status === 403) {
                    console.error(`API Error ${status}: ${body.slice(0, 500)}`);
                    console.log('Session expired or forbidden. Triggering re-login...');
                    createLoginWindow();
                    reject(new Error(`Session expired (${status}). Login window opened.`));
                    return;
                }

                if (status === 429) {
                    reject(new Error(`API rate limited (429). Bitte kurz warten und erneut versuchen.`));
                    return;
                }

                let parsed: unknown;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    const cf1015 = /1015|cloudflare/i.test(body);
                    const hint = cf1015
                        ? ' Cloudflare 1015: zu viele Requests oder Schutz – kurz warten, ggf. im Browser auf stake.com einloggen.'
                        : '';
                    const preview = trimmed.slice(0, 280);
                    reject(
                        new Error(
                            `API antwortete nicht mit JSON (HTTP ${status}).${hint} Body: ${preview}`
                        )
                    );
                    return;
                }

                if (status >= 400) {
                    console.error(`API Error ${status}: ${body.slice(0, 500)}`);
                }

                resolve(parsed);
            });
        });

        request.on('error', (error) => {
            console.error('API Request Network Error:', error);
            reject(error);
        });

        request.write(JSON.stringify({ query, variables }));
        request.end();
    });
});

/** Stake Originals REST (z. B. Blackjack) – POST mit Session-Cookies wie GraphQL. */
ipcMain.handle(
    'stake-casino-rest-post',
    async (_event, payload: { path?: string; body?: unknown; referer?: string }) => {
        const pathStr = String(payload?.path || '').trim();
        if (!pathStr.startsWith('/_api/casino/')) {
            return Promise.reject(new Error('Ungültiger Casino-REST-Pfad.'));
        }
        const origin = await resolveStakeOrigin();
        const sessionTokenMatch = sessionData.cookies.match(/session=([^;]+)/);
        const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : '';
        if (!sessionToken) {
            return Promise.reject(
                new Error('Keine Stake-Session (Cookie session). Bitte einloggen und erneut starten.')
            );
        }
        const bodyObj = payload?.body && typeof payload.body === 'object' ? payload.body : {};
        const referer =
            typeof payload?.referer === 'string' && payload.referer.trim().startsWith('http')
                ? payload.referer.trim()
                : `${origin}/casino/games/blackjack`;

        return new Promise((resolve, reject) => {
            const request = net.request({
                method: 'POST',
                url: origin + pathStr,
                useSessionCookies: true,
            });
            request.setHeader('Content-Type', 'application/json');
            request.setHeader('Accept', 'application/json');
            request.setHeader('x-access-token', sessionToken);
            request.setHeader('x-lockdown-token', `sl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            request.setHeader('Origin', origin);
            request.setHeader('Referer', referer);
            if (sessionData.userAgent) {
                request.setHeader('User-Agent', sessionData.userAgent);
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
                        reject(new Error(`Casino-REST-Antwort zu groß (> ${MAX_IPC_RESPONSE_BYTES} bytes).`));
                        return;
                    }
                    const body = Buffer.concat(chunks).toString();
                    const status = response.statusCode ?? 0;
                    const trimmed = body.trim();

                    if (status === 401 || status === 403) {
                        console.error(`Casino REST ${status}: ${body.slice(0, 500)}`);
                        console.log('Session expired or forbidden. Triggering re-login...');
                        createLoginWindow();
                        reject(new Error(`Session expired (${status}). Login window opened.`));
                        return;
                    }

                    if (status === 429) {
                        reject(new Error(`API rate limited (429). Bitte kurz warten und erneut versuchen.`));
                        return;
                    }

                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(body);
                    } catch {
                        const cf1015 = /1015|cloudflare/i.test(body);
                        const hint = cf1015
                            ? ' Cloudflare 1015: zu viele Requests oder Schutz – kurz warten, ggf. im Browser auf stake.com einloggen.'
                            : '';
                        const preview = trimmed.slice(0, 280);
                        reject(
                            new Error(
                                `Casino-REST antwortete nicht mit JSON (HTTP ${status}).${hint} Body: ${preview}`
                            )
                        );
                        return;
                    }

                    if (status >= 400) {
                        console.error(`Casino REST ${status}: ${body.slice(0, 500)}`);
                        reject(new Error(`Casino-REST HTTP ${status}: ${extractStakeJsonErrorMessage(parsed)}`));
                        return;
                    }

                    if (parsed && typeof parsed === 'object') {
                        const po = parsed as Record<string, unknown>;
                        if (Array.isArray(po.errors) && po.errors.length > 0) {
                            reject(new Error(`Casino-REST: ${extractStakeJsonErrorMessage(parsed)}`));
                            return;
                        }
                    }

                    resolve(parsed);
                });
            });

            request.on('error', (error) => {
                console.error('Casino REST Network Error:', error);
                reject(error);
            });

            request.write(JSON.stringify(bodyObj));
            request.end();
        });
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
             url = 'https://stake.com' + path;
             // Usually allowed by generic check, but we set it explicitly
             isAllowed = true;
             type = 'rgs'; // Standard API handling
        } else if (url.startsWith('/')) {
             // Default other relative URLs to stake.com
             url = 'https://stake.com' + url;
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
                'api.clawbuster.com', 'clawbuster-cdn.com', 'gsplauncher.de'
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
            if (!requestHeaders['Content-Type']) {
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
    app.quit();
    win = null;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
    // Inject headers for requests to stake.com from Renderer (if any)
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://stake.com/*', '*://*.stake.com/*'] },
      (details: { requestHeaders: Record<string, string> }, callback: (response: { requestHeaders: Record<string, string> }) => void) => {
        details.requestHeaders['Origin'] = 'https://stake.com';
        details.requestHeaders['Referer'] = 'https://stake.com/';
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    createWindow();

    if (app.isPackaged) {
        console.log('[Updater] App is packaged, checking for updates...');
        autoUpdater.checkForUpdates();
    }
});
