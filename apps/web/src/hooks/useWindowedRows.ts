/**
 * @file useWindowedRows.ts
 * @description Long lists of fixed-height rows build only the rows on screen,
 *   plus a margin, as the mobile app's recycled lists do: My Music's 1,700 songs
 *   were 61,000 elements, slow to open and to scroll. Follows the nearest
 *   scrolling ancestor (the main panel). Short lists render whole.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useLayoutEffect, useState, type RefObject } from 'react';

/** Below this many rows, everything is rendered (nothing to gain, nothing changes). */
export const WINDOW_FROM = 100;
/** Rows built beyond each edge of the screen, so a fast scroll never shows a gap. */
const OVERSCAN = 12;

/**
 * The ancestor that really scrolls vertically. A horizontal scroller (`.table-scroll`) also
 * computes `overflow-y: auto` but grows with its rows: it is skipped.
 */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

/** The `[start, end)` rows to build; `bodyRef` is the element the rows start in. */
export function useWindowedRows(count: number, rowHeight: number, bodyRef: RefObject<HTMLElement | null>): [number, number] {
  const windowed = count > WINDOW_FROM;
  const [range, setRange] = useState<[number, number]>(() => [0, windowed ? Math.min(count, 40) : count]);

  useLayoutEffect(() => {
    if (!windowed) {
      setRange([0, count]);
      return;
    }
    const body = bodyRef.current;
    const scroller = scrollParent(body);
    if (!body || !scroller) {
      setRange([0, count]);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      // Where the rows begin inside the scrolled content.
      const top = body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const first = Math.floor((scroller.scrollTop - top) / rowHeight) - OVERSCAN;
      const last = Math.ceil((scroller.scrollTop + scroller.clientHeight - top) / rowHeight) + OVERSCAN;
      const start = Math.max(0, Math.min(count, first));
      const end = Math.max(start, Math.min(count, last));
      setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(onScroll);
    resize.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [windowed, count, rowHeight, bodyRef]);

  return range;
}
