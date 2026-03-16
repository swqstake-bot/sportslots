import { app, BrowserWindow, ipcMain, net, session, shell, globalShortcut } from 'electron';
import https from 'node:https';
import http from 'node:http';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';
import os from 'os';
import { DIST, VITE_PUBLIC, SPIN_SAMPLES_DIR, VITE_DEV_SERVER_URL, ELECTRON_DIR } from './config.js';
import { sessionData, captureSession } from './sessionCapture.js';

let win: BrowserWindow | null;
let loginWin: BrowserWindow | null;

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
      sandbox: false
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
            let body = '';
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                try {
                    if (response.statusCode >= 400) {
                        console.error(`API Error ${response.statusCode}: ${body}`);
                        // If 401/403, session might be expired
                        if (response.statusCode === 401 || response.statusCode === 403) {
                             console.log('Session expired or forbidden. Triggering re-login...');
                             createLoginWindow();
                             // Rejecting so the UI knows
                             reject(new Error(`Session expired (${response.statusCode}). Login window opened.`));
                             return;
                        }
                    }
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
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
      } catch {}
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
      } catch {}
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
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
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
