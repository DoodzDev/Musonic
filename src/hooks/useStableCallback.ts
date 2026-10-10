/**
 * @file useStableCallback.ts
 * @description Returns a function whose identity never changes but which always
 *   calls the latest version of the given callback. Lets memoized list rows keep
 *   a strict props comparator without ever invoking a stale closure.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useCallback, useLayoutEffect, useRef} from 'react';

export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: A) => fnRef.current(...args), []);
}
