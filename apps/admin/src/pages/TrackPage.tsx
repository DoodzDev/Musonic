/**
 * @file TrackPage.tsx
 * @description One song of the library: its tags, its files (format, place, imported or not),
 *   the online catalogs that know it, its likes and plays; listening to a file to check it.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '@musonic/icons';
import type { TrackDetail, TrackFile } from '@musonic/core';
import { api } from '../api.ts';
import { bytes, date } from '../format.ts';
import { t } from '../i18n/index.ts';
import { ErrorLine } from '../components/ui.tsx';
import { ListenButton } from '../components/Listen.tsx';
import { coverUrl } from '../listen.ts';

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "MP3 · 320 kbit/s · 44,1 kHz · 16 bits · stéréo · 7,8 Mo". */
function fileLine(f: TrackFile): string {
  return [
    f.format.toUpperCase(),
    f.bitRate ? `${f.bitRate} kbit/s` : '',
    f.sampleRate ? `${(f.sampleRate / 1000).toLocaleString(t.locale)} kHz` : '',
    f.bitDepth ? `${f.bitDepth} bits` : '',
    f.channels ? t.track.channels(f.channels) : '',
    bytes(f.size),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function TrackPage() {
  const { id = '' } = useParams();
  const [d, setD] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<TrackDetail>(`/v1/admin/library/tracks/${encodeURIComponent(id)}`).then(setD).catch((e: Error) => setError(e.message));
  }, [id]);

  const first = d?.files.find((f) => !f.missing);
  const sub = d ? [d.artist, d.album, d.year].filter(Boolean).join(' · ') : '';
  const position = d ? t.track.position(d.discNumber, d.trackNumber) : '';

  return (
    <>
      <Link className="btn ghost sm" to="/library"><Icon name="back-arrow" size={14} /> {t.track.back}</Link>
      <ErrorLine error={error} />
      {d && (
        <>
          <div className="head mt-s">
            <div className="row" style={{ alignItems: 'flex-end', gap: 22 }}>
              <img className="cover lg" src={coverUrl(d.id, 300)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div><h1>{d.title}</h1><p className="sub">{sub}{position ? ` · ${position}` : ''} · {duration(d.durationMs)}</p></div>
            </div>
            {first && <ListenButton item={{ fileId: first.id, trackId: d.id, title: d.title, artist: d.artist }} label={t.track.listen} primary />}
          </div>

          <div className="card">
            <h2>{t.track.files}</h2>
            {d.files.map((f) => (
              <div key={f.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Icon name={f.missing ? 'alert-triangle' : 'music-note'} size={18} />
                <div className="small" style={{ minWidth: 0 }}>
                  <b style={{ wordBreak: 'break-all' }}>{f.path}</b>
                  <div className="muted">
                    {fileLine(f)}
                    {f.hasCover ? ` · ${t.track.hasCover}` : ''}
                    {f.imported && <> · <span className="tag accent">{t.track.imported}</span></>}
                    {f.missing && <> · <span className="tag bad">{t.track.missing}</span></>}
                  </div>
                </div>
                {!f.missing && <div style={{ marginLeft: 'auto' }}><ListenButton item={{ fileId: f.id, trackId: d.id, title: d.title, artist: d.artist }} /></div>}
              </div>
            ))}
            {d.files.length === 0 && <p className="muted small">{t.track.noFile}</p>}
          </div>

          <div className="card mt">
            <dl className="kv">
              <dt>{t.track.likes}</dt><dd>{t.track.likesOf(d.likes)}</dd>
              <dt>{t.track.plays}</dt><dd>{d.plays.toLocaleString(t.locale)}</dd>
              {d.genres.length > 0 && <><dt>{t.track.genres}</dt><dd>{d.genres.join(', ')}</dd></>}
              {d.albumArtist && d.albumArtist !== d.artist && <><dt>{t.library.album}</dt><dd>{d.album} · {d.albumArtist}</dd></>}
              {d.isrc && <><dt>{t.track.isrc}</dt><dd>{d.isrc}</dd></>}
              {d.sources.length > 0 && <><dt>{t.track.sources}</dt><dd>{d.sources.join(', ')}</dd></>}
              <dt>{t.track.added}</dt><dd>{date(d.createdAt)}</dd>
              <dt>{t.track.id}</dt><dd>{d.id}</dd>
            </dl>
          </div>
        </>
      )}
    </>
  );
}
