/**
 * KeyAuth API – Init & Login für Subscription-Schutz
 * API-Dokumentation: https://keyauthdocs.apidog.io
 */

const KEYAUTH_URL = 'https://keyauth.win/api/1.3/';

interface KeyAuthResponse {
  success: boolean;
  message: string;
  sessionid?: string;
  download?: string;
  info?: any;
}

interface KeyAuthInitResponse {
  sessionid: string;
}

export function isKeyAuthEnabled(): boolean {
  const ownerId = import.meta.env.VITE_KEYAUTH_OWNER_ID;
  const appName = import.meta.env.VITE_KEYAUTH_APP_NAME;
  return Boolean(ownerId && appName);
}

function getConfig() {
  const ownerId = import.meta.env.VITE_KEYAUTH_OWNER_ID;
  const appName = import.meta.env.VITE_KEYAUTH_APP_NAME || 'Test1111';
  const version = import.meta.env.VITE_KEYAUTH_VERSION || '1.0.0';
  if (!ownerId || !appName) {
    throw new Error('KeyAuth ist nicht konfiguriert (VITE_KEYAUTH_OWNER_ID, VITE_KEYAUTH_APP_NAME fehlen).');
  }
  return { ownerId, appName, version };
}

let cachedSessionId: string | null = null;

async function doRequest(body: Record<string, string | undefined>): Promise<KeyAuthResponse | string> {
  // Remove undefined values
  const cleanBody: Record<string, string> = {};
  for (const key in body) {
    if (body[key] !== undefined) {
      cleanBody[key] = body[key] as string;
    }
  }

  const res = await fetch(KEYAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cleanBody).toString(),
  });
  
  if (!res.ok) {
    throw new Error(`KeyAuth HTTP ${res.status}`);
  }
  
  const data = await res.json();
  return data;
}

/**
 * Initialisiert die KeyAuth-Session (muss vor Login ausgeführt werden).
 */
export async function keyAuthInit(): Promise<KeyAuthInitResponse> {
  const { ownerId, appName, version } = getConfig();
  const data = await doRequest({
    type: 'init',
    name: appName,
    ownerid: ownerId,
    version,
  });

  if (data === 'KeyAuth_Invalid') {
    throw new Error('KeyAuth: Diese Anwendung existiert nicht.');
  }
  
  if (typeof data === 'object') {
      if (data.message === 'invalidver' && data.download) {
        throw new Error('KeyAuth: App veraltet. Bitte aktualisieren.');
      }
      if (data.success === false) {
        throw new Error(data.message || 'KeyAuth Init fehlgeschlagen.');
      }
      if (!data.sessionid) {
        throw new Error('KeyAuth: Keine Session-ID erhalten.');
      }
      cachedSessionId = data.sessionid;
      return { sessionid: data.sessionid };
  }
  
  throw new Error('KeyAuth: Unerwartetes Antwortformat.');
}

/**
 * Generiert ein Web-Fingerprint (min. 20 Zeichen – KeyAuth-Anforderung).
 */
function getWebHwid(): string {
  try {
    const data = [
      navigator.userAgent,
      navigator.language,
      String(screen.width) + 'x' + String(screen.height),
      String(new Date().getTimezoneOffset()),
      navigator.platform || 'unknown',
    ].join('|');
    const encoded = btoa(encodeURIComponent(data)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    return encoded.length >= 20 ? encoded : encoded + '0'.repeat(20 - encoded.length);
  } catch {
    return 'web-browser-default-fallback-xx';
  }
}

/**
 * Login mit Benutzername und Passwort.
 * @param {string} username
 * @param {string} password
 * @param {string} [hwid] – optional, für Lizenzbindung (Web: Browser-Fingerprint)
 */
export async function keyAuthLogin(username: string, password: string, hwid = ''): Promise<KeyAuthResponse> {
  const { ownerId, appName } = getConfig();
  if (!cachedSessionId) await keyAuthInit();
  
  const effectiveHwid = (hwid && hwid.length >= 20) ? hwid : getWebHwid();
  
  const body = {
    type: 'login',
    name: appName,
    ownerid: ownerId,
    sessionid: cachedSessionId!,
    username: username.trim(),
    pass: password,
    hwid: effectiveHwid,
  };
  
  const data = await doRequest(body);
  
  if (typeof data === 'string') {
      throw new Error('KeyAuth: Unerwartete String-Antwort beim Login.');
  }

  if (data.success === false) {
    throw new Error(data.message || 'Login fehlgeschlagen');
  }
  return data;
}
