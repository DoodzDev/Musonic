/**
 * @file App.tsx
 * @description Web client shell: login, sidebar, playlist page and player bar.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useMemo, useState } from 'react';
import { SubsonicClient, type Playlist, type PlaylistWithSongs, type Song, type SubsonicSession } from '@musonic/core';
import { LoginScreen } from './components/LoginScreen.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { PlaylistView } from './components/PlaylistView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { fr } from './i18n/fr.ts';
import { clearSession, loadSession, saveSession, transportSession } from './lib/session.ts';

type PageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; playlist: PlaylistWithSongs };

export default function App() {
  const [session, setSession] = useState<SubsonicSession | null>(loadSession);
  const client = useMemo(() => (session ? new SubsonicClient(transportSession(session)) : null), [session]);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<PageState>({ status: 'idle' });

  // The queue is a snapshot of the playlist that was playing, so browsing
  // another playlist does not change what plays next.
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueSourceId, setQueueSourceId] = useState<string | null>(null);
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    client
      .getPlaylists(controller.signal)
      .then((list) => {
        setPlaylists(list);
        if (!list[0]) return;
        setPage((current) => (current.status === 'idle' ? { status: 'loading' } : current));
        setSelectedId((current) => current ?? list[0].id);
      })
      .catch(() => setPlaylists([]));
    return () => controller.abort();
  }, [client]);

  useEffect(() => {
    if (!client || !selectedId) return;
    const controller = new AbortController();
    client
      .getPlaylist(selectedId, controller.signal)
      .then((playlist) => setPage({ status: 'ready', playlist }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setPage({ status: 'error' });
      });
    return () => controller.abort();
  }, [client, selectedId]);

  function selectPlaylist(id: string) {
    if (id === selectedId) return;
    setPage({ status: 'loading' });
    setSelectedId(id);
  }

  function login(next: SubsonicSession) {
    saveSession(next);
    setSession(next);
  }

  function logout() {
    clearSession();
    setSession(null);
    setPlaylists([]);
    setSelectedId(null);
    setPage({ status: 'idle' });
    setQueue([]);
    setIndex(-1);
  }

  function playFromPage(i: number) {
    if (page.status !== 'ready') return;
    setQueue(page.playlist.entry);
    setQueueSourceId(page.playlist.id);
    setIndex(i);
  }

  if (!session || !client) return <LoginScreen onLogin={login} />;

  const currentSongId = index >= 0 ? (queue[index]?.id ?? null) : null;
  const pageSongId = page.status === 'ready' && page.playlist.id === queueSourceId ? currentSongId : null;

  return (
    <div className="app">
      <div className="app-body">
        <aside className="side-panel">
          <Sidebar
            client={client}
            username={session.username}
            playlists={playlists}
            selectedId={selectedId}
            playingId={queueSourceId}
            onSelect={selectPlaylist}
            onLogout={logout}
          />
        </aside>
        <main className="main-panel">
          {page.status === 'ready' && (
            <PlaylistView client={client} playlist={page.playlist} currentSongId={pageSongId} onPlay={playFromPage} />
          )}
          {page.status === 'loading' && <p className="page muted">{fr.playlist.loading}</p>}
          {page.status === 'error' && <p className="page muted">{fr.playlist.error}</p>}
          {page.status === 'idle' && <p className="page muted">{fr.playlist.pick}</p>}
        </main>
      </div>
      <PlayerBar client={client} queue={queue} index={index} onIndexChange={setIndex} />
    </div>
  );
}
