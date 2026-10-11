/**
 * @file DrawerContainer.tsx
 * @description Opens the Design v2 Profile sheet, which replaced the side
 *   drawer (ADR-010 B2-B3). Keeps the `useDrawer().open()` entry point used by
 *   the headers so callers did not have to change; the old drawer and its
 *   edge swipe are gone.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import ProfileSheet from './shell/ProfileSheet';

type DrawerCtx = {open: () => void; close: () => void};
const DrawerContext = createContext<DrawerCtx>({open: () => {}, close: () => {}});
export const useDrawer = () => useContext(DrawerContext);

type Props = {children: React.ReactNode};

export default function DrawerContainer({children}: Props) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({open, close}), [open, close]);

  return (
    <DrawerContext.Provider value={value}>
      {children}
      <ProfileSheet visible={visible} onClose={close} />
    </DrawerContext.Provider>
  );
}
