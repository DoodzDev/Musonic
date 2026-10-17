/**
 * @file toast.ts
 * @description Shows a short confirmation ("Added to queue") from anywhere;
 *   `ToastHost` displays the latest one above the player bar.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

export const TOAST_EVENT = 'musonic:toast';

export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}
