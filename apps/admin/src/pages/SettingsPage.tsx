/**
 * @file SettingsPage.tsx
 * @description Settings and maintenance: the console's language and the size of the activity
 *   log. The server's other settings, backups and the hosted web client come with lot C7.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { JournalPage, JournalSize } from '@musonic/core';
import { api } from '../api.ts';
import { bytes, date } from '../format.ts';
import { LANGS, lang, setLang, t, type Lang } from '../i18n/index.ts';
import { ErrorLine, Seg } from '../components/ui.tsx';

const MB = 1000 * 1000;
const SIZES = [10, 50, 100, 250, 500, 1000, 5000].map((n) => n * MB);

function JournalCard() {
  const [size, setSize] = useState<JournalSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<JournalPage>('/v1/admin/journal?limit=1')
      .then((r) => setSize(r.size))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const choose = (maxBytes: number) => {
    api<JournalSize>('/v1/admin/journal/settings', { method: 'PUT', body: { maxBytes } })
      .then(setSize)
      .catch((e: Error) => setError(e.message));
  };
  const options = size && !SIZES.includes(size.maxBytes) ? [...SIZES, size.maxBytes].sort((a, b) => a - b) : SIZES;
  return (
    <div className="card">
      <h2>{t.journal.settingsTitle}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>{t.journal.settingsHelp}</p>
      {size && (
        <>
          <div className="spread small"><span>{t.journal.used(bytes(size.bytes), size.lines.toLocaleString(t.locale))}</span><span className="muted">{Math.round((size.bytes / size.maxBytes) * 100)} %</span></div>
          <div className="bar mt-s"><i style={{ width: `${Math.min(100, (size.bytes / size.maxBytes) * 100)}%` }} /></div>
          {size.oldest && <p className="muted small mt-s">{t.journal.oldest(date(size.oldest))}</p>}
          <div className="setting">
            <div><b>{t.journal.maxSize}</b></div>
            <select className="input" style={{ width: 'auto' }} value={size.maxBytes} onChange={(e) => choose(Number(e.target.value))}>
              {options.map((b) => <option key={b} value={b}>{bytes(b)}</option>)}
            </select>
          </div>
        </>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

export function SettingsPage() {
  return (
    <>
      <div className="head"><div><h1>{t.settings.title}</h1></div></div>
      <div className="grid g2">
        <div className="card">
          <h2>{t.settings.language}</h2>
          <Seg<Lang> value={lang} options={(Object.keys(LANGS) as Lang[]).map((l) => [l, LANGS[l].name])} onChange={setLang} />
          <p className="muted small mt-s">{t.settings.languageHelp}</p>
        </div>
        <JournalCard />
        <div className="card empty">{t.settings.more}</div>
      </div>
    </>
  );
}
