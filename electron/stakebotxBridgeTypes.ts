/**
 * StakeBot-X renderer bridge — shared types for Electron main/preload and the Vite renderer.
 * Keep this file free of Node/Electron imports so it can be included by the app TS project.
 */

export type StakebotxRendererSourceKind = 'none' | 'url' | 'file';

/** How the bridge chose a mount target (for debugging / UI). */
export type StakebotxRendererResolvedFrom =
  | 'env:url'
  | 'env:static'
  | 'repo-static-candidate'
  | 'dev-localhost-default'
  | 'none';

export interface StakebotxRendererProbeResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Safe, inspectable description of where the StakeBot-X UI can be loaded from.
 * Legacy shell stays default when `available` is false — consumers should fall back gracefully.
 */
export interface StakebotxRendererBridgeInfo {
  available: boolean;
  kind: StakebotxRendererSourceKind;
  /** Normalized URL for webview / BrowserView / iframe `src` (http(s) or file://). */
  mountHref: string | null;
  resolvedFrom: StakebotxRendererResolvedFrom;
  /** Short label for dev tools / UI. */
  label: string;
  /** Absolute paths that were considered (static candidates). */
  checkedPaths: string[];
  probe?: StakebotxRendererProbeResult;
}

/** Renderer-only status for the bridge row (not part of the Electron IPC contract). */
export interface StakebotxBridgeUiStatus {
  lastCheckedAt: number | null;
  /** One-line probe / fetch outcome for the placeholder status row. */
  probeStatusText: string;
  isRefreshing: boolean;
}

const DEFAULT_UI_STATUS: StakebotxBridgeUiStatus = {
  lastCheckedAt: null,
  probeStatusText: '—',
  isRefreshing: false,
};

export function getDefaultStakebotxBridgeUiStatus(): StakebotxBridgeUiStatus {
  return { ...DEFAULT_UI_STATUS };
}

/** Build a single-line status from bridge info or a top-level IPC error (truncated for UI). */
export function formatStakebotxProbeStatusLine(
  info: StakebotxRendererBridgeInfo | null,
  topLevelError: string | null,
  maxLen = 120
): string {
  const clip = (s: string) => (s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s);
  if (topLevelError) {
    const t = topLevelError.trim();
    return t ? clip(t) : '—';
  }
  if (!info) return '—';
  const p = info.probe;
  if (!p) return info.available ? 'No probe data' : 'Unavailable';
  if (p.ok) return p.statusCode != null ? `OK · HTTP ${p.statusCode}` : 'OK';
  const err = (p.error || 'probe failed').trim();
  return err ? clip(err) : 'Probe failed';
}

/**
 * Safe href preview for plain-text UI (http(s) / file only; length-capped).
 * Does not validate full URL grammar — main process remains authoritative.
 */
export function safePreviewBridgeHref(href: string | null | undefined, maxLen = 96): string | null {
  if (href == null || typeof href !== 'string') return null;
  const t = href.trim();
  if (!t) return null;
  const head = t.slice(0, 12).toLowerCase();
  if (!head.startsWith('https://') && !head.startsWith('http://') && !head.startsWith('file://')) {
    return '(unsupported URL scheme)';
  }
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}
