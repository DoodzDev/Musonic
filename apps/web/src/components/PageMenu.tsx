/**
 * @file PageMenu.tsx
 * @description Right-click menu anywhere no more precise menu answers (page
 *   background, sidebar, headers…): back / forward, the main pages, reload.
 *   Mounted once; listens to the right clicks the other menus left alone.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { tr } from '../i18n/index.ts';
import { claimContextMenu } from '../player/contextMenu.ts';
import { MenuRow, MenuShell } from './MenuShell.tsx';

export function PageMenu() {
  const t = tr.contextMenu;
  const navigate = useNavigate();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      // A track or a card already answered.
      if (event.defaultPrevented) return;
      if (!claimContextMenu(event)) return;
      setAt({ x: event.clientX, y: event.clientY });
    }
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  if (!at) return null;
  const close = () => setAt(null);
  const go = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <MenuShell x={at.x} y={at.y} label={t.label} onClose={close}>
      <MenuRow onClick={go(() => navigate(-1))}>{t.back}</MenuRow>
      <MenuRow onClick={go(() => navigate(1))}>{t.forward}</MenuRow>
      <div className="menu-separator" />
      <MenuRow onClick={go(() => navigate('/'))}>{tr.nav.home}</MenuRow>
      <MenuRow onClick={go(() => navigate('/search'))}>{tr.nav.search}</MenuRow>
      <MenuRow onClick={go(() => navigate('/library'))}>{tr.nav.library}</MenuRow>
      <MenuRow onClick={go(() => navigate('/my-music'))}>{t.myMusic}</MenuRow>
      <div className="menu-separator" />
      <MenuRow onClick={go(() => window.location.reload())}>{t.reload}</MenuRow>
      <p className="menu-hint">{t.browserHint}</p>
    </MenuShell>
  );
}
