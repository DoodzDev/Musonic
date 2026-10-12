/**
 * @file useScrollMemory.ts
 * @description Restores the scroll position of each visited page in the main panel.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

export function useScrollMemory(ref: RefObject<HTMLElement | null>): void {
  const location = useLocation();
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = positions.current.get(location.key) ?? 0;
    const save = () => positions.current.set(location.key, element.scrollTop);
    element.addEventListener('scroll', save, { passive: true });
    return () => element.removeEventListener('scroll', save);
  }, [location.key, ref]);
}
