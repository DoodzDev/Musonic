/**
 * @file TrackTable.tsx
 * @description Track list used by playlist, album, artist and liked pages.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Song } from '@musonic/core';
import { Link } from 'react-router';
import { fr } from '../i18n/fr.ts';
import { formatTime } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { ClockIcon } from './Icons.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';

interface Props {
  songs: Song[];
  /** Queue source id, e.g. `album:12`, to highlight the playing row only in its own context. */
  sourceId: string;
  label: string;
  showAlbum?: boolean;
  showCover?: boolean;
  /** Album pages number tracks with their track number. */
  numbering?: 'index' | 'track';
}

const t = fr.table;

export function TrackTable({ songs, sourceId, label, showAlbum = true, showCover = true, numbering = 'index' }: Props) {
  const { playSongs, current, sourceId: playingSource, playing } = usePlayer();
  const playingId = playingSource === sourceId ? current?.id : undefined;
  const columns = showAlbum ? 'cols-4' : 'cols-3';

  return (
    <div className="table-scroll">
      <div role="table" aria-label={label} className={`track-table ${columns}`}>
        <div role="row" className="track-row track-head">
          <span role="columnheader" className="c-index">{t.index}</span>
          <span role="columnheader">{t.title}</span>
          {showAlbum && <span role="columnheader" className="c-album">{t.album}</span>}
          <span role="columnheader" className="c-duration" aria-label={t.duration}><ClockIcon /></span>
        </div>
        {songs.map((song, i) => {
          const isCurrent = song.id === playingId;
          const play = () => playSongs(songs, i, sourceId);
          return (
            <div key={`${song.id}-${i}`} role="row" className={'track-row' + (isCurrent ? ' is-current' : '')} onDoubleClick={play}>
              <span role="cell" className="c-index">
                {isCurrent ? (
                  <span className="num"><Equalizer playing={playing} label={t.nowPlaying} /></span>
                ) : (
                  <span className="num">{numbering === 'track' ? (song.track ?? i + 1) : i + 1}</span>
                )}
                <button type="button" className="row-play" onClick={play} aria-label={t.playTrack(song.title)}>
                  <PlayIcon size={14} color="currentColor" />
                </button>
              </span>
              <span role="cell" className="c-title">
                {showCover && <Cover coverArt={song.coverArt} size={42} className="cover-42" />}
                <span className="item-text">
                  <span className={'item-title' + (isCurrent ? ' is-playing' : '')}>{song.title}</span>
                  {song.artistId ? (
                    <Link to={`/artist/${song.artistId}`} className="item-sub link">{song.artist}</Link>
                  ) : (
                    <span className="item-sub">{song.artist}</span>
                  )}
                </span>
              </span>
              {showAlbum && (
                <span role="cell" className="c-album">
                  {song.albumId ? (
                    <Link to={`/album/${song.albumId}`} className="item-sub link">{song.album}</Link>
                  ) : (
                    <span className="item-sub">{song.album}</span>
                  )}
                </span>
              )}
              <span role="cell" className="c-duration item-sub">{formatTime(song.duration)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
