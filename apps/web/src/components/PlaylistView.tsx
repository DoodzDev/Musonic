/**
 * @file PlaylistView.tsx
 * @description Playlist page: header, Play button and the track table.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { PlaylistWithSongs, SubsonicClient } from '@musonic/core';
import { fr } from '../i18n/fr.ts';
import { formatTime, formatTotal } from '../lib/format.ts';
import { ClockIcon, EqualizerIcon, PlayIcon } from './Icons.tsx';

interface Props {
  client: SubsonicClient;
  playlist: PlaylistWithSongs;
  currentSongId: string | null;
  onPlay: (index: number) => void;
}

const t = fr.playlist;

export function PlaylistView({ client, playlist, currentSongId, onPlay }: Props) {
  const songs = playlist.entry;
  return (
    <div className="page">
      <header className="playlist-header">
        <span className="cover cover-hero">
          {playlist.coverArt && <img src={client.coverArtUrl(playlist.coverArt, 480)} alt="" />}
        </span>
        <div className="playlist-meta">
          <span className="eyebrow">{t.kind}</span>
          <h1>{playlist.name}</h1>
          {playlist.comment && <p className="playlist-comment">{playlist.comment}</p>}
          <span className="playlist-stats">{t.meta(playlist.owner, playlist.songCount, formatTotal(playlist.duration))}</span>
        </div>
      </header>

      <div className="actions">
        <button type="button" className="btn-primary btn-play" onClick={() => onPlay(0)} disabled={songs.length === 0}>
          <PlayIcon size={16} /> {t.play}
        </button>
      </div>

      {songs.length === 0 ? (
        <p className="muted">{t.empty}</p>
      ) : (
        <div className="table-scroll">
          <div role="table" aria-label={playlist.name} className="track-table">
            <div role="row" className="track-row track-head">
              <span role="columnheader" className="c-index">{t.columns.index}</span>
              <span role="columnheader">{t.columns.title}</span>
              <span role="columnheader" className="c-album">{t.columns.album}</span>
              <span role="columnheader" className="c-duration" aria-label={t.columns.duration}><ClockIcon /></span>
            </div>
            {songs.map((song, i) => {
              const current = song.id === currentSongId;
              return (
                <div
                  key={`${song.id}-${i}`}
                  role="row"
                  className={'track-row' + (current ? ' is-current' : '')}
                  onDoubleClick={() => onPlay(i)}
                >
                  <span role="cell" className="c-index">
                    {current ? (
                      <span className="accent num" role="img" aria-label={t.nowPlaying}><EqualizerIcon /></span>
                    ) : (
                      <span className="num">{i + 1}</span>
                    )}
                    <button type="button" className="row-play" onClick={() => onPlay(i)} aria-label={t.playTrack(song.title)}>
                      <PlayIcon size={14} />
                    </button>
                  </span>
                  <span role="cell" className="c-title">
                    <span className="cover cover-42">
                      {song.coverArt && <img src={client.coverArtUrl(song.coverArt, 96)} alt="" loading="lazy" />}
                    </span>
                    <span className="item-text">
                      <span className={'item-title' + (current ? ' is-playing' : '')}>{song.title}</span>
                      <span className="item-sub">{song.artist}</span>
                    </span>
                  </span>
                  <span role="cell" className="c-album item-sub">{song.album}</span>
                  <span role="cell" className="c-duration item-sub">{formatTime(song.duration)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
