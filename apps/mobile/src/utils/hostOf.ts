/**
 * @file hostOf.ts
 * @description Host of a server URL, as shown to the user.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

/** `https://music.example.com/` → `music.example.com`. */
export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
