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

export async function captureSession(): Promise<void> {
  try {
    const cookies = await session.defaultSession.cookies.get({});
    sessionData.cookies = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const cf = cookies.find((c) => c.name === 'cf_clearance');
    if (cf) sessionData.cfClearance = cf.value;

    const cfBm = cookies.find((c) => c.name === '__cf_bm');
    if (cfBm) sessionData.cfBm = cfBm.value;

    sessionData.userAgent = session.defaultSession.getUserAgent();

    console.log('Session captured:', {
      cookieCount: cookies.length,
      hasCf: !!cf,
      hasCfBm: !!cfBm,
    });
  } catch (err) {
    console.error('Failed to capture session:', err);
  }
}
