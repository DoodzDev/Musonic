/**
 * @file AppContext.tsx
 * @description Logged-in session, API client and request cache shared by every page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import type { MemoryCache, SubsonicClient, SubsonicSession } from '@musonic/core';

export interface AppContextValue {
  session: SubsonicSession;
  client: SubsonicClient;
  cache: MemoryCache;
  logout: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppContext');
  return value;
}
