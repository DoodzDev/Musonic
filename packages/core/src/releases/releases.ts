/**
 * @file releases.ts
 * @description Reads the GitHub releases of the Musonic monorepo. Each app is
 *   tagged with its own prefix (`mobile-v1.2.3`, `web-v0.1.0`, `desktop-v…`),
 *   so every app only ever looks at its own releases: a web release never
 *   triggers a mobile update prompt, and the reverse. Dependency-free so the
 *   mobile app can import it on its own.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

export type MusonicApp = 'mobile' | 'web' | 'desktop';

/** The fields we read from a GitHub `GET /repos/{owner}/{repo}/releases` item. */
export interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface AppRelease {
  app: MusonicApp;
  /** Plain version, without prefix: `1.2.3`. */
  version: string;
  tag: string;
  url: string;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Returns the version carried by `tag` if it belongs to `app` (`mobile-v1.2.3` → `1.2.3`), else null. */
export function parseReleaseTag(tag: string, app: MusonicApp): string | null {
  const prefix = `${app}-v`;
  if (!tag.startsWith(prefix)) return null;
  const version = tag.slice(prefix.length);
  return VERSION.test(version) ? version : null;
}

/** Compares two `X.Y.Z` versions numerically (a leading `v` is ignored): < 0, 0 or > 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True if `remote` is strictly newer than `local`. */
export function isNewerVersion(remote: string, local: string): boolean {
  return compareVersions(remote, local) > 0;
}

/** Picks the newest published (non-draft, non-prerelease) release of `app`, or null if there is none. */
export function latestRelease(releases: readonly GitHubRelease[], app: MusonicApp): AppRelease | null {
  let best: AppRelease | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name) continue;
    const version = parseReleaseTag(r.tag_name, app);
    if (!version) continue;
    if (!best || compareVersions(version, best.version) > 0) {
      best = { app, version, tag: r.tag_name, url: r.html_url ?? '' };
    }
  }
  return best;
}
