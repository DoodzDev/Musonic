/**
 * @file LibraryPage.tsx
 * @description The library: playlists (with the liked songs, a "New playlist"
 *   button and, on a Musonic Server, "Import" a Spotify or Deezer playlist) then
 *   "Play by genre", albums and artists, each in a grid of the same cards as the Home.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CardItem } from '@musonic/core';
import { PageStatus } from '../components/CollectionHeader.tsx';
import { GenreGrid } from '../components/GenreGrid.tsx';
import { ImportPlaylistDialog } from '../components/ImportPlaylistDialog.tsx';
import { TextDialog } from '../components/TextDialog.tsx';
import { Shelf } from '../components/Shelf.tsx';
import { MusicNoteIcon } from '../components/icons/MusicNoteIcon.tsx';
import { PlayIcon } from '../components/icons/PlayIcon.tsx';
import { PlusIcon } from '../components/icons/PlusIcon.tsx';
import { DownloadArrowIcon } from '../components/icons/DownloadArrowIcon.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { loadAllSongs, MY_MUSIC_KEY } from '../lib/allSongs.ts';
import { useMusonicServer } from '../lib/musonicApi.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { usePlaylistActions } from '../player/usePlaylistActions.ts';

const t = tr.library;
type Tab = 'playlists' | 'albums' | 'artists';
const TABS: Tab[] = ['playlists', 'albums', 'artists'];

/** "Ma Musique" card: the whole library, like the mobile app. */
function MyMusicCard() {
  const { client, cache, session } = useApp();
  const { playSongs } = usePlayer();
  const play = async () => {
    const songs = await cache.get(`${session.username}|${MY_MUSIC_KEY}`, TTL_LONG, () => loadAllSongs(client)).catch(() => []);
    if (songs.length) playSongs(songs, undefined, 'mymusic');
  };
  return (
    <div className="card">
      <Link to="/my-music" className="card-link">
        <span className="card-art"><span className="special-art"><MusicNoteIcon size={56} /></span></span>
        <span className="card-text">
          <span className="card-title">{t.myMusic}</span>
          <span className="card-sub">{t.myMusicSub}</span>
        </span>
      </Link>
      <button type="button" className="card-play" onClick={() => void play()} aria-label={`${tr.page.play} ${t.myMusic}`}>
        <PlayIcon size={18} color="currentColor" />
      </button>
    </div>
  );
}

function Playlists() {
  const { client } = useApp();
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const starred = useCachedQuery(keys.starred, TTL_SHORT, () => client.getStarred());
  if (playlists.status !== 'ready') return <PageStatus status={playlists.status} />;
  const items: CardItem[] = [
    { type: 'liked', count: starred.status === 'ready' ? starred.data.song.length : 0 },
    ...playlists.data.map((playlist): CardItem => ({ type: 'playlist', playlist })),
  ];
  return (
    <>
      <Shelf title={t.tabs.playlists} items={items} wrap leading={<MyMusicCard />} />
      <GenreGrid />
    </>
  );
}

function Albums() {
  const { client } = useApp();
  const albums = useCachedQuery('library:albums', TTL_LONG, () => client.getAlbumList('alphabeticalByName', { size: 500 }));
  if (albums.status !== 'ready') return <PageStatus status={albums.status} />;
  return <Shelf title={t.tabs.albums} items={albums.data.map((album): CardItem => ({ type: 'album', album }))} wrap />;
}

function Artists() {
  const { client } = useApp();
  const artists = useCachedQuery('library:artists', TTL_LONG, () => client.getArtists());
  if (artists.status !== 'ready') return <PageStatus status={artists.status} />;
  return <Shelf title={t.tabs.artists} items={artists.data.map((artist): CardItem => ({ type: 'artist', artist }))} wrap />;
}

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('playlists');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { session } = useApp();
  const musonic = useMusonicServer(session);
  const navigate = useNavigate();
  const { create } = usePlaylistActions();

  async function newPlaylist(name: string) {
    setCreating(false);
    const created = await create(name);
    if (created) navigate(`/playlist/${created.id}`);
    else window.alert(t.failed);
  }

  return (
    <div className="page">
      <div className="page-title-row">
        <h1 className="page-title">{t.title}</h1>
        <div className="page-title-actions">
          {musonic && (
            <button type="button" className="btn-tinted" onClick={() => setImporting(true)}>
              <DownloadArrowIcon size={18} /> {tr.importPlaylist.open}
            </button>
          )}
          <button type="button" className="btn-tinted" onClick={() => setCreating(true)}>
            <PlusIcon size={18} /> {t.newPlaylist}
          </button>
        </div>
      </div>
      <nav aria-label={t.title} className="chips">
        {TABS.map((tb) => (
          <button key={tb} type="button" className={'chip' + (tb === tab ? ' is-on' : '')} aria-pressed={tb === tab} onClick={() => setTab(tb)}>
            {t.tabs[tb]}
          </button>
        ))}
      </nav>
      {tab === 'playlists' && <Playlists />}
      {tab === 'albums' && <Albums />}
      {tab === 'artists' && <Artists />}
      {importing && <ImportPlaylistDialog onClose={() => setImporting(false)} />}
      {creating && (
        <TextDialog
          title={t.newPlaylist}
          label={t.newPlaylistLabel}
          initial={t.newPlaylistDefault}
          confirm={tr.common.create}
          onConfirm={newPlaylist}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
