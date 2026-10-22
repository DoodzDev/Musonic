/**
 * @file PlaybackPage.tsx
 * @description « Lecture »: what every app receives. ffmpeg (needed to make streams smaller),
 *   the highest bit rate for every account (an account's own limit wins when lower), the
 *   format of smaller streams, the caches of online songs and of pictures. Volume levelling
 *   comes later.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@musonic/icons';
import type { Playback } from '@musonic/core';
import { useAutoRefresh } from '../refresh.ts';
import { api } from '../api.ts';
import { bytes } from '../format.ts';
import { t } from '../i18n/index.ts';
import { useServerSettings } from '../serverSettings.ts';
import { ErrorLine, Seg } from '../components/ui.tsx';
import { RestartNote } from '../components/Restart.tsx';

const RATES = [0, 320, 256, 192, 128, 96];
type Format = 'mp3' | 'opus' | 'aac';

export function PlaybackPage() {
  const [status, setStatus] = useState<Playback | null>(null);
  const [freed, setFreed] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const settings = useServerSettings();
  const load = useCallback(() => {
    api<Playback>('/v1/admin/playback').then(setStatus).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useAutoRefresh(load);

  const clear = (kind: 'streams' | 'covers' | 'transcoded') => {
    setError(null);
    api<{ freed: number }>(`/v1/admin/caches/clear?kind=${kind}`, { method: 'POST' })
      .then((r) => {
        setFreed((f) => ({ ...f, [kind]: r.freed }));
        load();
      })
      .catch((e: Error) => setError(e.message));
  };
  const rate = Number(settings.value('max_bit_rate') ?? 0);
  const rates = RATES.includes(rate) ? RATES : [...RATES, rate].sort((a, b) => a - b);
  const p = t.playback;

  return (
    <>
      <div className="head"><div><h1>{p.title}</h1><p className="sub">{p.sub}</p></div></div>
      <RestartNote needed={settings.restartNeeded} />
      <ErrorLine error={error ?? settings.error} />
      <div className="grid g2">
        <div className="card">
          <h2>{p.streaming}</h2>
          <div className="setting">
            <div><b>ffmpeg</b><p>{status?.ffmpeg ? p.ffmpegOk : p.ffmpegMissing}</p></div>
            <span className={'tag' + (status?.ffmpeg ? ' ok' : status ? ' bad' : '')} style={{ whiteSpace: 'nowrap' }}>{status ? (status.ffmpeg ? p.present(status.ffmpeg.replace(/^ffmpeg version\s*n?/i, '').split(/[\s-]/)[0]) : p.absent) : '…'}</span>
          </div>
          {settings.loaded && (
            <>
              <div className="setting">
                <div><b>{p.maxRate[0]}</b><p>{p.maxRate[1]}</p></div>
                <select className="input" style={{ width: 'auto' }} value={rate} onChange={(e) => settings.set('max_bit_rate', Number(e.target.value))}>
                  {rates.map((r) => <option key={r} value={r}>{r ? `${r} kbit/s` : t.common.noLimit}</option>)}
                </select>
              </div>
              <div className="setting">
                <div><b>{p.format[0]}</b><p>{p.format[1]}</p></div>
                <Seg<Format> value={(settings.value('transcode_format') as Format) ?? 'mp3'} options={[['mp3', 'MP3'], ['opus', 'Opus'], ['aac', 'AAC']]} onChange={(f) => settings.set('transcode_format', f)} />
              </div>
            </>
          )}
        </div>
        <div className="card">
          <h2>{p.caches}</h2>
          <div className="setting">
            <div><b>{p.streams[0]}</b><p>{p.streams[1]}</p><p>{freed.streams !== undefined ? t.settings.cleared(bytes(freed.streams)) : status ? p.size(bytes(status.streamsBytes), status.streams) : '…'}</p></div>
            <button className="btn sm" onClick={() => clear('streams')}><Icon name="trash" size={14} /> {t.settings.clear}</button>
          </div>
          <div className="setting">
            <div><b>{p.covers[0]}</b><p>{p.covers[1]}</p><p>{freed.covers !== undefined ? t.settings.cleared(bytes(freed.covers)) : status ? t.settings.cachesSize(bytes(status.coversBytes)) : '…'}</p></div>
            <button className="btn sm" onClick={() => clear('covers')}><Icon name="trash" size={14} /> {t.settings.clear}</button>
          </div>
          <div className="setting">
            <div><b>{p.transcoded[0]}</b><p>{p.transcoded[1]}</p><p>{freed.transcoded !== undefined ? t.settings.cleared(bytes(freed.transcoded)) : status ? t.settings.cachesSize(bytes(status.transcodedBytes)) : '…'}</p></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {settings.loaded && (
                <select className="input" style={{ width: 'auto' }} value={Number(settings.value('transcode_cache_mb') ?? 500)} onChange={(e) => settings.set('transcode_cache_mb', Number(e.target.value))}>
                  {[0, 250, 500, 1000, 2000, 5000].map((mb) => <option key={mb} value={mb}>{mb ? bytes(mb * 1024 * 1024) : p.none}</option>)}
                </select>
              )}
              <button className="btn sm" onClick={() => clear('transcoded')}><Icon name="trash" size={14} /> {t.settings.clear}</button>
            </div>
          </div>
          <div className="setting">
            <div><b>{p.levelling[0]}</b><p>{p.levelling[1]}</p></div>
            <span className="tag">{p.later}</span>
          </div>
        </div>
      </div>
    </>
  );
}
