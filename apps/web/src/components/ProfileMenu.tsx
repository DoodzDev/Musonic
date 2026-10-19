/**
 * @file ProfileMenu.tsx
 * @description Account avatar (orange, like the mobile app) opening the profile
 *   menu: account and server, switch account, settings, about links and log
 *   out. Sits at the top right of the page; the menu opens below it, always
 *   inside the window. Closes on Escape or a click outside.
 * @author DoodzProg
 * @version 0.3.2
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { tr } from '../i18n/index.ts';
import { SettingsDialog } from './SettingsDialog.tsx';
import { ChevronDownIcon } from './icons/ChevronDownIcon.tsx';

const Chevron = () => <span className="chevron-right"><ChevronDownIcon size={16} /></span>;

const t = tr.profile;
const MENU_WIDTH = 280;

function serverName(baseUrl: string): string {
  if (!baseUrl) return window.location.host;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, borderRadius: size / 2, fontSize: Math.round(size * 0.44) }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a className="menu-row" href={href} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <Chevron />
    </a>
  );
}

export function ProfileMenu() {
  const { session, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setPos({ left: Math.max(8, Math.min(box.left, window.innerWidth - MENU_WIDTH - 8)), top: box.bottom + 8 });
    setOpen(!open);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="profile" ref={rootRef}>
      <button
        type="button"
        className="avatar-btn"
        ref={buttonRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.open}
        title={session.username}>
        <Avatar name={session.username} size={48} />
      </button>

      {open && (
        <div className="profile-menu" role="menu" aria-label={t.title} style={{ ...pos, width: MENU_WIDTH }}>
          <div className="profile-head">
            <Avatar name={session.username} size={56} />
            <span className="profile-name">{session.username}</span>
            <span className="profile-server">{serverName(session.baseUrl)}</span>
          </div>

          <div className="menu-group">
            <button type="button" className="menu-row" role="menuitem" onClick={logout}>
              <span>{t.switchAccount}</span>
              <Chevron />
            </button>
            <button
              type="button"
              className="menu-row"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSettings(true);
              }}>
              <span>{t.settings}</span>
              <Chevron />
            </button>
          </div>

          <span className="menu-caption">{t.about}</span>
          <div className="menu-group">
            <LinkRow href="https://doodzprog.github.io/Musonic/" label={t.website} />
            <LinkRow href="https://github.com/DoodzProg/Musonic" label="GitHub" />
            <LinkRow href="https://doodz.dev" label="doodz.dev" />
          </div>
          <span className="menu-note">Musonic Web {__MUSONIC_WEB_VERSION__} · made by Doodz</span>

          <div className="menu-group">
            <button type="button" className="menu-row is-destructive" role="menuitem" onClick={logout}>
              {t.logout}
            </button>
          </div>
        </div>
      )}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </div>
  );
}
