import { app, BrowserWindow, session, ipcMain, net, shell } from 'electron';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'crypto';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define paths for production/dev
const DIST = path.join(__dirname, '../dist');
const VITE_PUBLIC = app.isPackaged ? DIST : path.join(DIST, '../public');

let win: BrowserWindow | null;
let loginWin: BrowserWindow | null;

// VITE_DEV_SERVER_URL is passed via cross-env in package.json scripts
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    // Open DevTools in production for debugging if needed (can be removed later)
    // win.webContents.openDevTools(); 
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

// Session Store
const sessionData = {
  cookies: '',
  userAgent: '',
  cfClearance: '',
  cfBm: '',
};

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

async function captureSession() {
    try {
        const cookies = await session.defaultSession.cookies.get({});
        // Format cookies for the Cookie header
        sessionData.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        const cf = cookies.find(c => c.name === 'cf_clearance');
        if (cf) sessionData.cfClearance = cf.value;

        const cfBm = cookies.find(c => c.name === '__cf_bm');
        if (cfBm) sessionData.cfBm = cfBm.value;

        sessionData.userAgent = session.defaultSession.getUserAgent();
        
        console.log('Session captured:', { 
            cookieCount: cookies.length, 
            hasCf: !!cf,
            hasCfBm: !!cfBm
        });
    } catch (err) {
        console.error('Failed to capture session:', err);
    }
}

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
                'popiplay', 'helio', 'samurai', '1000lakes', 'hacksawgaming.com', 'd1oa92ndvzdrfz.cloudfront.net'
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

        const request = net.request({
            method,
            url,
            useSessionCookies: true,
        });

        // Apply headers based on type
        const requestHeaders = { ...headers };

        if (type === 'pragmatic') {
            try {
                const urlObj = new URL(url);
                const origin = `${urlObj.protocol}//${urlObj.host}`;
                const referer = method === 'GET' ? url : `${origin}/gs2c/html5Game.do`;
                requestHeaders['Origin'] = origin;
                requestHeaders['Referer'] = referer;
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

        Object.entries(requestHeaders).forEach(([k, v]) => {
            if (v) request.setHeader(k, v as string);
        });

        if (!request.getHeader('User-Agent') && sessionData.userAgent) {
            request.setHeader('User-Agent', sessionData.userAgent);
        }

        if (body) {
            if (typeof body === 'object' && !Buffer.isBuffer(body)) {
                request.write(JSON.stringify(body));
            } else {
                request.write(body);
            }
        }

        request.on('response', (response) => {
            const chunks: any[] = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const data = Buffer.concat(chunks).toString();
                resolve({
                    status: response.statusCode,
                    statusText: response.statusMessage,
                    headers: response.headers,
                    data: data,
                    finalUrl: (response as any).responseUrl || url
                });
            });
        });

        request.on('error', (error) => {
            console.error('Proxy Request Error:', error);
            reject(error);
        });

        request.end();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
    // Inject headers for requests to stake.com from Renderer (if any)
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://stake.com/*', '*://*.stake.com/*'] }, (details, callback) => {
        details.requestHeaders['Origin'] = 'https://stake.com';
        details.requestHeaders['Referer'] = 'https://stake.com/';
        callback({ requestHeaders: details.requestHeaders });
    });

    createWindow();

    if (app.isPackaged) {
        console.log('[Updater] App is packaged, checking for updates...');
        autoUpdater.checkForUpdates();
    }
});
