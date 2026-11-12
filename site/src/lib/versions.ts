/**
 * @file versions.ts
 * @description The newest published version of each Musonic app, read from the GitHub releases
 *   once per build (the Pages workflow also rebuilds the site when a release is published).
 *   Falls back to the versions below when GitHub cannot be reached, so a build never fails.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */
export type App = 'mobile' | 'web' | 'server';

const FALLBACK: Record<App, string> = { mobile: '2.4.0', web: '1.2.0', server: '1.2.1' };

let cache: Promise<Record<App, string>> | undefined;

function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

async function load(): Promise<Record<App, string>> {
  const found: Partial<Record<App, string>> = {};
  try {
    const res = await fetch('https://api.github.com/repos/DoodzDev/Musonic/releases?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      for (const r of (await res.json()) as { tag_name: string; draft: boolean; prerelease: boolean }[]) {
        const m = /^(mobile|web|server)-v(\d+\.\d+\.\d+)$/.exec(r.tag_name);
        if (!m || r.draft || r.prerelease) continue;
        const app = m[1] as App;
        if (!found[app] || newer(m[2], found[app]!)) found[app] = m[2];
      }
    }
  } catch {
    // Offline build: keep the fallback versions.
  }
  return { ...FALLBACK, ...found };
}

export function versions(): Promise<Record<App, string>> {
  return (cache ??= load());
}
