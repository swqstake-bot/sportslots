/**
 * Electron-App-Konfiguration – Pfade und Konstanten zentral.
 */

import path from 'node:path';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Verzeichnis der Electron-Main-Dateien */
export const ELECTRON_DIR = __dirname;

/** Build-Ausgabe (dist/) */
export const DIST = path.join(__dirname, '../dist');

/** Public/Static-Assets – im Build = dist, im Dev = dist/../public */
export const VITE_PUBLIC = app.isPackaged ? DIST : path.join(DIST, '../public');

/** Slot-Spin-Samples-Verzeichnis (userData) */
export const SPIN_SAMPLES_DIR = path.join(app.getPath('userData'), 'slot-spin-samples');

/** Vite Dev-Server-URL (via cross-env gesetzt) */
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] as string | undefined;

/** Proxy-URL-Whitelist für proxy-request – erlaubte Host-Präfixe */
export const PROXY_ALLOWED_HOSTS = [
  'https://d1oa92ndvzdrfz.cloudfront.net',
  'https://stake.com',
  'https://stake.bet',
  'https://*.stake.com',
  'https://*.cloudfront.net',
] as const;
