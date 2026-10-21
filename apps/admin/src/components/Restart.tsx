/**
 * @file Restart.tsx
 * @description Restarting the server from the console: a confirmation, then the page waits for
 *   the server to answer again (its container starts it again) and reloads.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { Icon } from '@musonic/icons';
import { api } from '../api.ts';
import { t } from '../i18n/index.ts';
import { ErrorLine, Modal } from './ui.tsx';

const WAIT_MS = 90_000;

/** Waits for the server to go away and come back. */
async function comeBack(): Promise<boolean> {
  const end = Date.now() + WAIT_MS;
  await new Promise((r) => setTimeout(r, 2000));
  while (Date.now() < end) {
    const ok = await fetch('/v1/info', { cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export function RestartButton({ label = t.restart.now, primary = false }: { label?: string; primary?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<'idle' | 'waiting' | 'timeout'>('idle');
  const [error, setError] = useState<string | null>(null);
  const restart = () => {
    setError(null);
    api('/v1/admin/restart', { method: 'POST' })
      .then(() => {
        setState('waiting');
        return comeBack();
      })
      .then((ok) => (ok ? location.reload() : setState('timeout')))
      .catch((e: Error) => setError(e.message));
  };
  return (
    <>
      <button className={'btn sm' + (primary ? ' primary' : '')} onClick={() => setAsking(true)}><Icon name="refresh" size={14} /> {label}</button>
      {asking && (
        <Modal title={t.restart.confirmTitle} onClose={() => state === 'idle' && setAsking(false)}>
          {state === 'idle' && <p className="muted small">{t.restart.confirmSub}</p>}
          {state === 'waiting' && <p className="small">{t.restart.restarting}</p>}
          {state === 'timeout' && <p className="error-line">{t.restart.timeout}</p>}
          <ErrorLine error={error} />
          {state !== 'waiting' && (
            <div className="actions">
              <button className="btn ghost" onClick={() => setAsking(false)}>{t.common.close}</button>
              {state === 'idle' && <button className="btn primary" onClick={restart}>{t.settings.restart}</button>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/** Shown on a page when one of the server's settings waits for a restart. */
export function RestartNote({ needed }: { needed: boolean }) {
  if (!needed) return null;
  return (
    <div className="alert warn" style={{ marginBottom: 18 }}>
      <div><b>{t.restart.needed}</b></div>
      <RestartButton primary />
    </div>
  );
}
