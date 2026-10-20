/**
 * @file useStatus.ts
 * @description The server's state shared by the console (see status.tsx).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import type { AdminStatus } from '@musonic/core';

/** `undefined` while loading, `null` when the server does not answer. */
export const StatusContext = createContext<AdminStatus | null | undefined>(undefined);

export function useStatus() {
  return useContext(StatusContext);
}
