/**
 * Stake.eu Turnstile solve via hidden BrowserWindow (same defaultSession cookies as login).
 * Sitekey is EU top-up specific — not the .com faucet/claim fallbacks.
 */
import { BrowserWindow, session } from 'electron';
import { STAKE_ORIGIN_EU } from './stakeSessionManager.js';
import { applyStakeBrowserUserAgent } from './stakeBrowserChrome.js';

/** Hardcoded stake.eu ClaimTopUpBonus sitekey (HAR / VIP modal). */
export const EU_TOPUP_TURNSTILE_SITEKEY = '0x4AAAAAACuwUw_2pQlCN9LX';

const TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SOLVE_TIMEOUT_MS = 45_000;
const LOAD_TIMEOUT_MS = 30_000;

let turnstileWin: BrowserWindow | null = null;
let solveInFlight: Promise<{ ok: boolean; token?: string; error?: string }> | null = null;

export function destroyEuTurnstileWindow(): void {
  if (turnstileWin && !turnstileWin.isDestroyed()) {
    try {
      turnstileWin.destroy();
    } catch {
      /* ignore */
    }
  }
  turnstileWin = null;
}

async function ensureEuTurnstileWindow(): Promise<BrowserWindow> {
  if (turnstileWin && !turnstileWin.isDestroyed()) {
    try {
      const url = turnstileWin.webContents.getURL();
      if (url.startsWith(STAKE_ORIGIN_EU)) return turnstileWin;
    } catch {
      /* recreate */
    }
    destroyEuTurnstileWindow();
  }

  // Off-screen but shown — CF Turnstile often fails in fully hidden windows.
  turnstileWin = new BrowserWindow({
    show: true,
    width: 420,
    height: 720,
    x: -12_000,
    y: -12_000,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      session: session.defaultSession,
    },
  });

  try {
    turnstileWin.setMenuBarVisibility(false);
  } catch {
    /* ignore */
  }
  applyStakeBrowserUserAgent(turnstileWin.webContents);

  turnstileWin.on('closed', () => {
    turnstileWin = null;
  });

  await new Promise<void>((resolve, reject) => {
    const w = turnstileWin!;
    const timer = setTimeout(() => {
      reject(new Error('turnstile_page_load_timeout'));
    }, LOAD_TIMEOUT_MS);
    w.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    w.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer);
      reject(new Error(`turnstile_page_load_failed: ${code} ${desc}`));
    });
    void w.loadURL(`${STAKE_ORIGIN_EU}/`);
  });

  return turnstileWin;
}

/**
 * Load CF Turnstile in the EU page context and return a fresh token.
 * Uses render+execute (SSP injectReloadApi pattern) with the hardcoded EU sitekey.
 */
export async function solveEuTopUpTurnstile(options?: {
  sitekey?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (solveInFlight) return solveInFlight;

  const sitekey = String(options?.sitekey || EU_TOPUP_TURNSTILE_SITEKEY).trim();
  const timeoutMs = Math.max(10_000, Number(options?.timeoutMs) || SOLVE_TIMEOUT_MS);

  solveInFlight = (async () => {
    try {
      const w = await ensureEuTurnstileWindow();
      const script = `
        (async () => {
          const SITEKEY = ${JSON.stringify(sitekey)};
          const API = ${JSON.stringify(TURNSTILE_API)};
          const TIMEOUT = ${JSON.stringify(timeoutMs)};

          function loadApi() {
            if (window.turnstile && typeof window.turnstile.render === 'function') {
              return Promise.resolve(window.turnstile);
            }
            return new Promise((resolve, reject) => {
              const cb = '__swqEuTsReady_' + Date.now();
              window[cb] = () => {
                try { delete window[cb]; } catch (_) {}
                if (window.turnstile) resolve(window.turnstile);
                else reject(new Error('turnstile_load_failed'));
              };
              const existing = document.getElementById('swq-eu-turnstile-loader');
              if (existing) existing.remove();
              const sc = document.createElement('script');
              sc.id = 'swq-eu-turnstile-loader';
              sc.async = true;
              sc.src = API + '&onload=' + cb;
              sc.onerror = () => reject(new Error('turnstile_script_error'));
              (document.head || document.documentElement).appendChild(sc);
              setTimeout(() => reject(new Error('turnstile_api_timeout')), TIMEOUT);
            });
          }

          const ts = await loadApi();
          const host = document.createElement('div');
          host.id = 'swq-eu-turnstile-host';
          host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:65px;opacity:0.01;overflow:hidden;pointer-events:none;z-index:-1';
          document.body.appendChild(host);

          return await new Promise((resolve, reject) => {
            let widgetId;
            let done = false;
            const finish = (fn) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              try { if (widgetId !== undefined) ts.remove(widgetId); } catch (_) {}
              try { host.remove(); } catch (_) {}
              fn();
            };
            const timer = setTimeout(() => {
              finish(() => reject(new Error('turnstile_widget_timeout')));
            }, TIMEOUT);

            try {
              widgetId = ts.render(host, {
                sitekey: SITEKEY,
                size: 'compact',
                execution: 'execute',
                theme: 'dark',
                callback: (token) => {
                  finish(() => {
                    if (token && String(token).length > 20) resolve(String(token));
                    else reject(new Error('turnstile_empty_token'));
                  });
                },
                'error-callback': (err) => {
                  finish(() => reject(new Error('turnstile_error: ' + String(err || 'unknown'))));
                },
                'timeout-callback': () => {
                  finish(() => reject(new Error('turnstile_timeout')));
                },
              });
              if (typeof ts.execute === 'function') {
                try { ts.execute(widgetId); } catch (_) {}
              }
            } catch (e) {
              finish(() => reject(e instanceof Error ? e : new Error(String(e))));
            }
          });
        })()
      `;

      const token = (await w.webContents.executeJavaScript(script, true)) as string;
      if (!token || String(token).length < 20) {
        return { ok: false, error: 'turnstile_empty_token' };
      }
      return { ok: true, token: String(token) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg || 'turnstile_failed' };
    } finally {
      solveInFlight = null;
    }
  })();

  return solveInFlight;
}
