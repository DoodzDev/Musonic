/**
 * @file hash.ts
 * @description Scrolls to the part of a page named after `#` in its address (`/data#cpu`),
 *   once that part is shown (links of the event bar).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';

export function useHashScroll(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, ready]);
}
