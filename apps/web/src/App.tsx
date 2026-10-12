/**
 * @file App.tsx
 * @description Web client shell: login gate, routes, sidebar and player bar.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { MemoryCache, SubsonicClient, type Song, type SubsonicSession } from '@musonic/core';
import { LoginScreen } from './components/LoginScreen.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { AppContext, type AppContextValue } from './context/AppContext.tsx';
import { useScrollMemory } from './hooks/useScrollMemory.ts';
import { clearSession, loadSession, saveSession, transportSession } from './lib/session.ts';
import { AlbumPage } from './pages/AlbumPage.tsx';
import { ArtistPage } from './pages/ArtistPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LikedPage } from './pages/LikedPage.tsx';
import { PlaylistPage } from './pages/PlaylistPage.tsx';
import { PlayerContext, type PlayerContextValue } from './player/PlayerContext.tsx';

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  useScrollMemory(mainRef);
  return (
    <div className="app">
      <div className="app-body">
        <aside className="side-panel">
          <Sidebar />
        </aside>
        <main className="main-panel" ref={mainRef}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/liked" element={<LikedPage />} />
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SubsonicSession | null>(loadSession);
  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(-1);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const app = useMemo<AppContextValue | null>(() => {
    if (!session) return null;
    return {
      session,
      client: new SubsonicClient(transportSession(session)),
      cache: new MemoryCache(),
      logout: () => {
        clearSession();
        setSession(null);
        setQueue([]);
        setIndex(-1);
        setSourceId(null);
      },
    };
  }, [session]);

  const player = useMemo<PlayerContextValue>(
    () => ({
      queue,
      index,
      sourceId,
      current: index >= 0 ? queue[index] : undefined,
      playing,
      setPlaying,
      playSongs: (songs, start, source) => {
        setQueue(songs);
        setIndex(songs.length ? start : -1);
        setSourceId(source);
      },
      setIndex,
    }),
    [queue, index, sourceId, playing],
  );

  if (!app) {
    return (
      <LoginScreen
        onLogin={(next) => {
          saveSession(next);
          setSession(next);
        }}
      />
    );
  }

  return (
    <AppContext.Provider value={app}>
      <PlayerContext.Provider value={player}>
        <Shell />
      </PlayerContext.Provider>
    </AppContext.Provider>
  );
}
