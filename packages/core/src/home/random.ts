/**
 * @file random.ts
 * @description Seeded pseudo-random helpers, so the home feed is stable within a day.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

export type Rng = () => number;

/** FNV-1a 32-bit hash of a string. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: small, fast, good enough for shuffling UI content. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed that changes once a day (local date) and differs per user. */
export function dailySeed(username: string, date: Date): number {
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return hashString(`${username}|${day}`);
}

/** Fisher-Yates on a copy. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length ? items[Math.floor(rng() * items.length)] : undefined;
}
