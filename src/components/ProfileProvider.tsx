/**
 * @file ProfileProvider.tsx
 * @description Hosts the Design v2 Profile sheet, which replaced the side
 *   drawer (ADR-010 B2-B3), and exposes `useProfile().open()` to the header
 *   avatars.
 * @author DoodzProg
 * @version 3.0.0
 * @license CC-BY-NC-4.0
 */
import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import ProfileSheet from './shell/ProfileSheet';

type ProfileCtx = {open: () => void; close: () => void};
const ProfileContext = createContext<ProfileCtx>({open: () => {}, close: () => {}});
export const useProfile = () => useContext(ProfileContext);

type Props = {children: React.ReactNode};

export default function ProfileProvider({children}: Props) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({open, close}), [open, close]);

  return (
    <ProfileContext.Provider value={value}>
      {children}
      <ProfileSheet visible={visible} onClose={close} />
    </ProfileContext.Provider>
  );
}
