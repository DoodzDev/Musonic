/**
 * @file semver.ts
 * @description Minimal semantic version comparison utilities.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

function parseSemVer(v: string): [number, number, number] {
  const [a = 0, b = 0, c = 0] = v.replace(/^v/, '').split('.').map(Number);
  return [a, b, c];
}

/** Returns true if `remote` is strictly newer than `local`. */
export function isNewerVersion(remote: string, local: string): boolean {
  const [rM, rm, rp] = parseSemVer(remote);
  const [lM, lm, lp] = parseSemVer(local);
  if (rM !== lM) return rM > lM;
  if (rm !== lm) return rm > lm;
  return rp > lp;
}
