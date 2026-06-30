import { app, session, type WebContents } from 'electron';

/** Match embedded Chromium so TLS / Client Hints stay consistent (Antebot-style). */
export function buildStakeBrowserUserAgent(): string {
  const chrome = process.versions.chrome || '130.0.0.0';
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Windows NT 10.0; Win64; x64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

export const STAKE_BROWSER_USER_AGENT = buildStakeBrowserUserAgent();

export function chromeMajorVersion(): string {
  return (process.versions.chrome || '130.0.0.0').split('.')[0] || '130';
}

/** Call before `app.whenReady()` — removes `Electron/x` from default session UA. */
export function configureStakeBrowserUserAgent(): void {
  app.userAgentFallback = STAKE_BROWSER_USER_AGENT;
}

export function applyDefaultSessionUserAgent(): void {
  session.defaultSession.setUserAgent(STAKE_BROWSER_USER_AGENT);
}

export function applyStakeBrowserUserAgent(contents: WebContents): void {
  contents.setUserAgent(STAKE_BROWSER_USER_AGENT);
}

export function stakeClientHintHeaders(): Record<string, string> {
  const major = chromeMajorVersion();
  return {
    'sec-ch-ua': `"Chromium";v="${major}", "Not:A-Brand";v="24", "Google Chrome";v="${major}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': process.platform === 'darwin' ? '"macOS"' : '"Windows"',
  };
}
