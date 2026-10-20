/**
 * @file LinkPage.tsx
 * @description Shared frame of the two public link pages (invitation, password reset): the
 *   link's state, then a form where the person chooses their password (twice).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import { Icon } from '@musonic/icons';
import { t } from '../i18n/index.ts';

export function PublicBox({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <div className="box">
        <div className="logo"><Icon name="logo" size={64} /></div>
        {children}
      </div>
    </div>
  );
}

export function PasswordFields({ password, confirm, onPassword, onConfirm }: { password: string; confirm: string; onPassword: (v: string) => void; onConfirm: (v: string) => void }) {
  return (
    <>
      <div className="field"><label htmlFor="pw">{t.link.password}</label><input id="pw" className="input" type="password" autoComplete="new-password" placeholder={t.link.passwordHint} value={password} onChange={(e) => onPassword(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw2">{t.link.confirm}</label><input id="pw2" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} /></div>
    </>
  );
}
