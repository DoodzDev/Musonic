/**
 * @file jumps.ts
 * @description A jump in the track (seek bar, notification, −15 / +30 s): Musonic
 *   Connect sends the new position at once (the other devices follow it by
 *   themselves otherwise). Its own module, so the player actions do not import
 *   the Connect service.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

let listener: (() => void) | null = null;

export function onJump(handler: () => void): void {
  listener = handler;
}

export function notifyJump(): void {
  listener?.();
}
