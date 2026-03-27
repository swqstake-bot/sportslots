import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import { NewMessage } from 'telegram/events/NewMessage.js';
import type { NewMessageEvent } from 'telegram/events/NewMessage.js';

const CONFIG_NAME = 'telegram_user_config.json';
const SESSION_NAME = 'telegram_string_session.txt';

type TelegramConfig = { apiId: number; apiHash: string };

function userDataPath(file: string): string {
  return path.join(app.getPath('userData'), file);
}

function loadConfig(): TelegramConfig | null {
  try {
    const p = userDataPath(CONFIG_NAME);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    const j = JSON.parse(raw) as { apiId?: number; apiHash?: string };
    if (typeof j.apiId === 'number' && typeof j.apiHash === 'string' && j.apiHash.length > 0) {
      return { apiId: j.apiId, apiHash: j.apiHash };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTelegramConfig(cfg: TelegramConfig): void {
  fs.writeFileSync(userDataPath(CONFIG_NAME), JSON.stringify(cfg, null, 2), 'utf-8');
}

export function loadTelegramConfig(): TelegramConfig | null {
  return loadConfig();
}

function loadSessionString(): string {
  try {
    const p = userDataPath(SESSION_NAME);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf-8').trim();
  } catch {
    return '';
  }
}

function saveSessionString(s: string): void {
  fs.writeFileSync(userDataPath(SESSION_NAME), s, 'utf-8');
}

function deleteSessionFile(): void {
  try {
    const p = userDataPath(SESSION_NAME);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

let client: TelegramClient | null = null;
let lastCredentials: TelegramConfig | null = null;

function getOrCreateClient(cfg: TelegramConfig): TelegramClient {
  if (
    client &&
    lastCredentials &&
    lastCredentials.apiId === cfg.apiId &&
    lastCredentials.apiHash === cfg.apiHash
  ) {
    return client;
  }
  void disconnectClient();
  const session = new StringSession(loadSessionString());
  client = new TelegramClient(session, cfg.apiId, cfg.apiHash, {
    connectionRetries: 5,
  });
  lastCredentials = cfg;
  return client;
}

type ListenState = {
  channelKey: string;
  handler: (event: NewMessageEvent) => void | Promise<void>;
  builder: NewMessage;
};

let listenState: ListenState | null = null;

async function disconnectClient(): Promise<void> {
  await telegramStopListen();
  if (!client) return;
  try {
    await client.disconnect();
  } catch {
    /* ignore */
  }
  client = null;
  lastCredentials = null;
}

let codeResolver: ((v: string) => void) | null = null;
let passwordResolver: ((v: string) => void) | null = null;

export function submitAuthCode(code: string): void {
  codeResolver?.(code.trim());
  codeResolver = null;
}

export function submitAuthPassword(password: string): void {
  passwordResolver?.(password);
  passwordResolver = null;
}

function waitForCode(): Promise<string> {
  return new Promise((resolve) => {
    codeResolver = resolve;
  });
}

function waitForPassword(): Promise<string> {
  return new Promise((resolve) => {
    passwordResolver = resolve;
  });
}

export type TelegramNotify = (channel: string, ...args: unknown[]) => void;

export async function telegramLogin(
  cfg: TelegramConfig,
  phone: string,
  notify: TelegramNotify
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedPhone = phone.trim();
  if (!normalizedPhone) {
    return { ok: false, error: 'Telefonnummer fehlt.' };
  }
  saveTelegramConfig(cfg);
  const c = getOrCreateClient(cfg);
  try {
    await c.connect();
    if (await c.checkAuthorization()) {
      const sess = c.session as StringSession;
      saveSessionString(sess.save() as unknown as string);
      return { ok: true };
    }
    await c.start({
      phoneNumber: async () => normalizedPhone,
      phoneCode: async (isCodeViaApp) => {
        notify('telegram-auth-needs-code', { isCodeViaApp: !!isCodeViaApp });
        return waitForCode();
      },
      password: async (hint) => {
        notify('telegram-auth-needs-password', { hint: hint || '' });
        return waitForPassword();
      },
      onError: async (err: Error) => {
        console.error('[Telegram] auth error:', err);
        return false;
      },
    });
    const sess = c.session as StringSession;
    saveSessionString(sess.save() as unknown as string);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] login failed:', e);
    return { ok: false, error: msg };
  }
}

export async function telegramStatus(): Promise<{
  hasConfig: boolean;
  hasSessionFile: boolean;
  connected: boolean;
  authorized: boolean;
}> {
  const hasConfig = loadConfig() != null;
  const hasSessionFile = loadSessionString().length > 0;
  const cfg = loadConfig();
  if (!cfg || !hasSessionFile) {
    return { hasConfig, hasSessionFile, connected: false, authorized: false };
  }
  try {
    const c = getOrCreateClient(cfg);
    await c.connect();
    const authorized = await c.checkAuthorization();
    return { hasConfig, hasSessionFile, connected: true, authorized };
  } catch {
    return { hasConfig, hasSessionFile, connected: false, authorized: false };
  }
}

function messageText(m: Api.Message): string {
  if ('message' in m && typeof (m as { message?: string }).message === 'string') {
    return (m as { message: string }).message;
  }
  return '';
}

export function normalizeChannelInput(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  const tme = s.match(/t\.me\/([A-Za-z0-9_]+)/i);
  if (tme) return tme[1];
  if (s.startsWith('@')) s = s.slice(1);
  return s.replace(/^\+/, '');
}

/**
 * Echtzeit: neue Nachrichten im Kanal (GramJS Updates), kein History-Fetch.
 */
export async function telegramStartListen(
  channelRaw: string,
  notify: TelegramNotify
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = loadConfig();
  if (!cfg) {
    return { ok: false, error: 'API-ID / API-Hash nicht konfiguriert.' };
  }
  const channel = normalizeChannelInput(channelRaw);
  if (!channel) {
    return { ok: false, error: 'Kanal / Gruppe ungültig.' };
  }
  await telegramStopListen();
  const c = getOrCreateClient(cfg);
  try {
    await c.connect();
    if (!(await c.checkAuthorization())) {
      return { ok: false, error: 'Nicht bei Telegram angemeldet.' };
    }
    const peer = channel.startsWith('@') ? channel : `@${channel}`;
    const builder = new NewMessage({ chats: [peer] });
    const handler = (event: NewMessageEvent) => {
      const msg = event.message;
      const payload = messageText(msg as Api.Message).trim();
      if (!payload) return;
      notify('telegram-live-message', {
        text: payload,
        id: (msg as { id?: number }).id,
        date: (msg as { date?: number }).date,
        channel: channel,
      });
    };
    c.addEventHandler(handler, builder);
    listenState = { channelKey: peer, handler, builder };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] listen start:', e);
    return { ok: false, error: msg };
  }
}

export async function telegramStopListen(): Promise<void> {
  if (!listenState || !client) {
    listenState = null;
    return;
  }
  try {
    client.removeEventHandler(listenState.handler, listenState.builder);
  } catch {
    /* ignore */
  }
  listenState = null;
}

export async function telegramFetchChannelMessages(
  channelRaw: string,
  limit: number
): Promise<{ ok: true; texts: string[] } | { ok: false; error: string }> {
  const cfg = loadConfig();
  if (!cfg) {
    return { ok: false, error: 'API-ID / API-Hash nicht konfiguriert.' };
  }
  const channel = normalizeChannelInput(channelRaw);
  if (!channel) {
    return { ok: false, error: 'Kanal / Gruppe ungültig.' };
  }
  const lim = Math.max(1, Math.min(200, Math.floor(limit) || 30));
  const c = getOrCreateClient(cfg);
  try {
    await c.connect();
    if (!(await c.checkAuthorization())) {
      return { ok: false, error: 'Nicht bei Telegram angemeldet. Bitte zuerst einloggen.' };
    }
    const peer = channel.startsWith('@') ? channel : `@${channel}`;
    const messages = await c.getMessages(peer, { limit: lim });
    const texts: string[] = [];
    for (const m of messages) {
      const t = messageText(m as Api.Message).trim();
      if (t) texts.push(t);
    }
    return { ok: true, texts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] fetch messages:', e);
    return { ok: false, error: msg };
  }
}

export async function telegramLogout(): Promise<void> {
  codeResolver = null;
  passwordResolver = null;
  await disconnectClient();
  deleteSessionFile();
}
