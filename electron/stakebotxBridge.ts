/**
 * Resolves and (optionally) probes the StakeBot-X renderer mount target from env and repo layout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  StakebotxRendererBridgeInfo,
  StakebotxRendererProbeResult,
  StakebotxRendererResolvedFrom,
  StakebotxRendererSourceKind,
} from './stakebotxBridgeTypes.js';

export type { StakebotxRendererBridgeInfo } from './stakebotxBridgeTypes.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  const prefix = `..${path.sep}`;
  if (rel === '..' || rel.startsWith(prefix)) return false;
  return true;
}

function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.normalize(p);
  }
}

/** http(s) URLs restricted to loopback by default — avoids accidental remote injection via env. */
export function isSafeStakebotxHttpUrl(urlStr: string, allowRemote: boolean): boolean {
  let u: URL;
  try {
    u = new URL(urlStr.trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return true;
  return allowRemote;
}

function normalizeDirectoryUrl(urlStr: string): string {
  const u = new URL(urlStr.trim());
  if (!u.pathname || u.pathname === '') u.pathname = '/';
  return u.href.endsWith('/') ? u.href : `${u.href}/`;
}

export interface ResolveStakebotxBridgeContext {
  repoRoot: string;
  isPackaged: boolean;
  env: NodeJS.ProcessEnv;
}

function staticIndexPath(dir: string): string {
  return path.join(dir, 'index.html');
}

function tryFileMount(
  absDir: string,
  resolvedFrom: StakebotxRendererResolvedFrom,
  checkedPaths: string[]
): { kind: StakebotxRendererSourceKind; mountHref: string; label: string; resolvedFrom: StakebotxRendererResolvedFrom } | null {
  checkedPaths.push(absDir);
  const indexPath = staticIndexPath(absDir);
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
    return null;
  }
  const href = pathToFileURL(indexPath).href;
  return {
    kind: 'file',
    mountHref: href,
    label: `StakeBot-X (static) — ${path.basename(absDir)}`,
    resolvedFrom,
  };
}

function allowStaticPath(absDir: string, ctx: ResolveStakebotxBridgeContext): boolean {
  const r = real(absDir);
  const roots = [
    real(ctx.repoRoot),
    real(path.join(ctx.repoRoot, 'apps', 'stakebotx-ui')),
    real(path.join(ctx.repoRoot, 'dist')),
  ];
  const allowRemote = ctx.env['STAKEBOTX_RENDERER_ALLOW_REMOTE_STATIC'] === '1';
  if (allowRemote) {
    return true;
  }
  return roots.some((root) => isPathInside(r, root) || r === root);
}

/**
 * Synchronous resolution: picks env URL, env static dir, then known repo candidates.
 * Does not perform network I/O.
 */
export function resolveStakebotxBridgeSync(ctx: ResolveStakebotxBridgeContext): StakebotxRendererBridgeInfo {
  const checkedPaths: string[] = [];
  const allowRemote =
    ctx.env['STAKEBOTX_RENDERER_ALLOW_REMOTE'] === '1' || ctx.env['STAKEBOTX_ALLOW_REMOTE_URL'] === '1';

  const envUrl = String(ctx.env['STAKEBOTX_RENDERER_URL'] || '').trim();
  if (envUrl && isSafeStakebotxHttpUrl(envUrl, allowRemote)) {
    const href = normalizeDirectoryUrl(envUrl);
    return {
      available: true,
      kind: 'url',
      mountHref: href,
      resolvedFrom: 'env:url',
      label: 'StakeBot-X (dev URL — STAKEBOTX_RENDERER_URL)',
      checkedPaths,
    };
  }

  const envStatic = String(ctx.env['STAKEBOTX_RENDERER_STATIC_PATH'] || '').trim();
  if (envStatic) {
    const abs = path.resolve(envStatic);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory() && allowStaticPath(abs, ctx)) {
      const hit = tryFileMount(abs, 'env:static', checkedPaths);
      if (hit) {
        return {
          available: true,
          ...hit,
          checkedPaths,
        };
      }
    } else {
      checkedPaths.push(abs);
    }
  }

  // Next `output: 'export'` writes `out/index.html` (see apps/stakebotx-ui/next.config.mjs). Optional copy target for packaging: dist/stakebotx-ui.
  const candidates = [
    path.join(ctx.repoRoot, 'apps', 'stakebotx-ui', 'out'),
    path.join(ctx.repoRoot, 'dist', 'stakebotx-ui'),
  ];
  for (const c of candidates) {
    const hit = tryFileMount(c, 'repo-static-candidate', checkedPaths);
    if (hit) {
      return {
        available: true,
        ...hit,
        checkedPaths,
      };
    }
  }

  if (!ctx.isPackaged) {
    const defaultDev = 'http://localhost:3000/';
    if (isSafeStakebotxHttpUrl(defaultDev, false)) {
      return {
        available: false,
        kind: 'url',
        mountHref: defaultDev,
        resolvedFrom: 'dev-localhost-default',
        label: 'StakeBot-X (dev — start apps/stakebotx-ui, default http://localhost:3000)',
        checkedPaths,
      };
    }
  }

  return {
    available: false,
    kind: 'none',
    mountHref: null,
    resolvedFrom: 'none',
    label: 'StakeBot-X renderer not configured (legacy UI)',
    checkedPaths,
  };
}

export async function probeStakebotxHttpUrl(urlStr: string, timeoutMs = 3200): Promise<StakebotxRendererProbeResult> {
  const u = urlStr.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    return { ok: false, error: 'not_http' };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(u, { method: 'GET', redirect: 'follow', signal: ac.signal });
    const code = res.status;
    const ok = code >= 200 && code < 400;
    return ok ? { ok: true, statusCode: code } : { ok: false, statusCode: code, error: `http_${code}` };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Optionally probes http(s) mounts so `available` reflects reachability.
 * File mounts are left unchanged (already verified on disk).
 */
export async function finalizeStakebotxBridge(
  base: StakebotxRendererBridgeInfo,
  opts: { probe: boolean; env: NodeJS.ProcessEnv }
): Promise<StakebotxRendererBridgeInfo> {
  if (base.kind === 'file') {
    return { ...base, available: true };
  }
  if (base.kind !== 'url' || !base.mountHref) return base;

  const skipProbe = opts.env['STAKEBOTX_RENDERER_SKIP_PROBE'] === '1';
  if (!opts.probe || skipProbe) {
    return { ...base, available: true };
  }

  const probe = await probeStakebotxHttpUrl(base.mountHref);
  return {
    ...base,
    available: probe.ok,
    probe,
  };
}
