/**
 * Session-Erfassung für Stake-Login – Cookies, User-Agent, Cloudflare-Tokens.
 */

import { session } from 'electron';

export interface SessionData {
  cookies: string;
  userAgent: string;
  cfClearance: string;
  cfBm: string;
}

export const sessionData: SessionData = {
  cookies: '',
  userAgent: '',
  cfClearance: '',
  cfBm: '',
};

let lastCaptureSignature = '';
let lastCaptureLogAtMs = 0;
const CAPTURE_LOG_MIN_INTERVAL_MS = 15000;

export async function captureSession(): Promise<void> {
  try {
    const cookies = await session.defaultSession.cookies.get({});
    sessionData.cookies = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const cf = cookies.find((c) => c.name === 'cf_clearance');
    if (cf) sessionData.cfClearance = cf.value;

    const cfBm = cookies.find((c) => c.name === '__cf_bm');
    if (cfBm) sessionData.cfBm = cfBm.value;

    sessionData.userAgent = session.defaultSession.getUserAgent();

    const signature = `${cookies.length}|${cf ? 1 : 0}|${cfBm ? 1 : 0}|${sessionData.userAgent}`;
    const now = Date.now();
    const shouldLog =
      signature !== lastCaptureSignature ||
      now - lastCaptureLogAtMs >= CAPTURE_LOG_MIN_INTERVAL_MS;
    if (shouldLog) {
      console.log('Session captured:', {
        cookieCount: cookies.length,
        hasCf: !!cf,
        hasCfBm: !!cfBm,
      });
      lastCaptureSignature = signature;
      lastCaptureLogAtMs = now;
    }
  } catch (err) {
    console.error('Failed to capture session:', err);
  }
}
