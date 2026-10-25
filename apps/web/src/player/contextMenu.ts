/**
 * @file contextMenu.ts
 * @description Right click everywhere opens a Musonic menu instead of the
 *   browser's. A second right click while a Musonic menu is open lets the
 *   browser's menu show (open in a new tab, copy the link…), and text fields
 *   keep the browser's menu (copy, paste).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

/** Class every Musonic menu carries: an open one makes the next right click the browser's. */
export const MENU_CLASS = 'track-menu';

let browserNext = false;

// The press comes before the `contextmenu` event and closes our menus: note whether one was open.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button === 2) browserNext = !!document.querySelector(`.${MENU_CLASS}`);
    },
    true,
  );
}

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/**
 * Decides who answers a right click: `true` = a Musonic menu (the browser's is
 * prevented), `false` = the browser's.
 */
export function claimContextMenu(event: { preventDefault: () => void; target: EventTarget | null }): boolean {
  if (browserNext) {
    browserNext = false;
    return false;
  }
  if (editable(event.target)) return false;
  event.preventDefault();
  return true;
}
