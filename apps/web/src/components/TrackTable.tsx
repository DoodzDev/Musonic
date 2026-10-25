/**
 * @file TrackTable.tsx
 * @description Track list used by playlist, album, artist, liked, genre and
 *   search pages. Like the mobile app, a heart shows the liked tracks and a
 *   "+" / "✓" whether the track is in one of the user's playlists.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import type { Song } from '@musonic/core';
import { Link } from 'react-router';
import { tr } from '../i18n/index.ts';
import { formatTime } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { ClockIcon } from './Icons.tsx';
import { AddToPlaylistButton } from './AddToPlaylistButton.tsx';
import { LikeButton } from './LikeButton.tsx';
import { PlaylistPicker } from './PlaylistPicker.tsx';
import { claimContextMenu } from '../player/contextMenu.ts';
import { usePlaylistMembership } from '../player/usePlaylistMembership.ts';
import { PlayIcon } from './icons/PlayIcon.tsx';
import { DotsHorizontalIcon } from './icons/DotsHorizontalIcon.tsx';
import { TrackMenu, type TrackMenuTarget } from './TrackMenu.tsx';

interface Props {
  songs: Song[];
  /** Queue source id, e.g. `album:12`, to highlight the playing row only in its own context. */
  sourceId: string;
  label: string;
  showAlbum?: boolean;
  showCover?: boolean;
  /** Album pages number tracks with their track number. */
  numbering?: 'index' | 'track';
  /** Set on a playlist page: the menu can remove a track from it. */
  playlistId?: string;
}

const t = tr.table;

export function TrackTable({ songs, sourceId, label, showAlbum = true, showCover = true, numbering = 'index', playlistId }: Props) {
  const [menu, setMenu] = useState<TrackMenuTarget | null>(null);
  const membership = usePlaylistMembership();
  const [picker, setPicker] = useState<Song | null>(null);
  const openMenu = (song: Song, index: number, x: number, y: number) =>
    setMenu({ song, x, y, playlistId, playlistIndex: playlistId ? index : undefined });
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
          <span role="columnheader" className="c-add" />
          <span role="columnheader" className="c-like" />
          <span role="columnheader" className="c-duration" aria-label={t.duration}><ClockIcon /></span>
          <span role="columnheader" className="c-more" />
        </div>
        {songs.map((song, i) => {
          const isCurrent = song.id === playingId;
          const play = () => playSongs(songs, i, sourceId);
          return (
            <div
              key={`${song.id}-${i}`}
              role="row"
              className={'track-row' + (isCurrent ? ' is-current' : '') + (menu?.song === song ? ' is-menu' : '')}
              onDoubleClick={play}
              onContextMenu={(e) => {
                if (claimContextMenu(e)) openMenu(song, i, e.clientX, e.clientY);
              }}>
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
              <span role="cell" className="c-add">
                <AddToPlaylistButton inPlaylist={!!membership?.get(song.id)?.size} onOpen={() => setPicker(song)} />
              </span>
              <span role="cell" className="c-like">
                <LikeButton song={song} />
              </span>
              <span role="cell" className="c-duration item-sub">{formatTime(song.duration)}</span>
              <span role="cell" className="c-more">
                <button
                  type="button"
                  className="icon-btn row-more"
                  aria-label={tr.trackMenu.label(song.title)}
                  title={tr.trackMenu.more}
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    openMenu(song, i, box.right - 200, box.bottom + 4);
                  }}>
                  <DotsHorizontalIcon size={18} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {menu && <TrackMenu target={menu} onClose={() => setMenu(null)} />}
      {picker && <PlaylistPicker song={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}
