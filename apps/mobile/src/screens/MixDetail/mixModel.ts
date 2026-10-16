/**
 * @file mixModel.ts
 * @description Pure rules of a Magic Mix: how many discoveries go with the
 *   listener's own songs, and how they are spread through the list.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

/** Share of discoveries in a mix (about 3 in 10). */
export const DISCOVERY_SHARE = 0.3;

/** Discoveries to fetch so they make up `DISCOVERY_SHARE` of the mix. */
export function discoveryCount(ownCount: number): number {
  if (ownCount <= 0) return 0;
  return Math.round((ownCount * DISCOVERY_SHARE) / (1 - DISCOVERY_SHARE));
}

/**
 * Spreads `discoveries` evenly through `own`, never first (the mix opens on
 * one of the listener's songs). Leftover discoveries go at the end.
 */
export function blendDiscoveries<T>(own: readonly T[], discoveries: readonly T[]): T[] {
  if (discoveries.length === 0) return [...own];
  if (own.length === 0) return [...discoveries];
  const every = Math.max(1, Math.round(own.length / discoveries.length));
  const out: T[] = [];
  let next = 0;
  own.forEach((song, i) => {
    out.push(song);
    if ((i + 1) % every === 0 && next < discoveries.length) out.push(discoveries[next++]);
  });
  return out.concat(discoveries.slice(next));
}
