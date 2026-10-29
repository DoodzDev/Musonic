/**
 * @file ConnectButton.tsx
 * @description « Listen on » (Musonic Connect, ADR-019): the button of the
 *   player bar, orange while music plays on another device, and its list of
 *   the account's devices online. A tap moves playback to that device at the
 *   same second. Nothing shows without a Musonic Server. The list opens on the
 *   page itself: inside the blurred player bar, it would be placed against the bar.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@musonic/icons';
import type { ConnectDevice } from '@musonic/core';
import { tr } from '../i18n/index.ts';
import { useConnect } from '../player/ConnectContext.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { useTransport } from '../player/transport.ts';
import { colors } from '../theme/tokens.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';

const t = tr.connect;

function iconOf(device: ConnectDevice): IconName {
  if (device.kind === 'phone' || device.kind === 'car') return 'phone';
  if (device.kind === 'speaker') return 'headphones';
  return 'computer';
}

export function ConnectButton({ size = 20, className = 'icon-btn icon-mode' }: { size?: number; className?: string }) {
  const connect = useConnect();
  const player = usePlayer();
  // Inside the remote mode, the player shown is the other device's.
  const remoteMode = !!useTransport().remoteDevice;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!connect) return null;
  const { snapshot, me, elsewhere } = connect;
  // The device that plays: this one, or the one elsewhere.
  const playingOn = !remoteMode && player.playing ? me : elsewhere?.playing ? elsewhere.device : null;
  const devices = [...snapshot.devices].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)));
  const label = elsewhere ? t.playingOn(snapshot.devices.find((d) => d.id === elsewhere.device)?.name ?? '') : t.button;

  return (
    <>
      <button
        type="button"
        className={className + (elsewhere?.playing ? ' is-on' : '')}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}>
        <Icon name="devices" size={size} color={elsewhere?.playing ? colors.accent : 'currentColor'} />
        {elsewhere?.playing && <span className="icon-dot" />}
      </button>
      {open && createPortal(
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dialog connect-dialog" role="dialog" aria-modal="true" aria-label={t.title}>
            <div className="dialog-head">
              <h2 className="dialog-title">{t.title}</h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={tr.common.close} title={tr.common.close}>
                <CloseIcon size={18} />
              </button>
            </div>
            <ul className="connect-list">
              {devices.map((d) => {
                const on = d.id === playingOn;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={'connect-device' + (on ? ' is-on' : '')}
                      disabled={on || !d.canPlay}
                      onClick={() => {
                        connect.transfer(d.id);
                        setOpen(false);
                      }}>
                      <Icon name={iconOf(d)} size={22} color={on ? colors.accent : 'currentColor'} />
                      <span className="item-text">
                        <span className="item-title">{d.name}</span>
                        <span className="item-sub">
                          {[d.id === me ? t.thisDevice : null, on ? t.playing : null, d.id === me && !on && elsewhere ? t.listenHere : null, d.alone ? t.alone : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {devices.length < 2 && <p className="setting-hint">{t.none}</p>}
            <div className="setting">
              <label className="setting-switch">
                <span>{t.sync}</span>
                <input type="checkbox" role="switch" aria-checked={snapshot.sync} checked={snapshot.sync} onChange={(e) => connect.setSync(e.target.checked)} />
              </label>
              <p className="setting-hint">{snapshot.sync ? t.syncOn : t.syncOff}</p>
              <p className="setting-hint">{t.adminNotice}</p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
