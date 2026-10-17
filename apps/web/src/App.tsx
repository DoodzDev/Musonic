/**
 * @file App.tsx
 * @description Web client shell: login gate, routes, sidebar, right panel (queue or lyrics) and player bar.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { MemoryCache, SubsonicClient, type SubsonicSession } from '@musonic/core';
import { LoginScreen } from './components/LoginScreen.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { LyricsPanel } from './components/LyricsPanel.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { ToastHost } from './components/Toast.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { AppContext, type AppContextValue } from './context/AppContext.tsx';
import { useScrollMemory } from './hooks/useScrollMemory.ts';
import { clearSession, loadSession, saveSession, transportSession } from './lib/session.ts';
import { AlbumPage } from './pages/AlbumPage.tsx';
import { ArtistPage } from './pages/ArtistPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { GenrePage } from './pages/GenrePage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { MyMusicPage } from './pages/MyMusicPage.tsx';
import { LikedPage } from './pages/LikedPage.tsx';
import { PlaylistPage } from './pages/PlaylistPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { PlayerContext, usePlayer } from './player/PlayerContext.tsx';
import { usePlaybackEngine } from './player/usePlaybackEngine.ts';

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  const { panel } = usePlayer();
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
            <Route path="/search" element={<SearchPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/my-music" element={<MyMusicPage />} />
            <Route path="/genre/:name" element={<GenrePage />} />
            <Route path="/liked" element={<LikedPage />} />
            <Route path="/playlist/:id" element={<PlaylistPage />} />
            <Route path="/album/:id" element={<AlbumPage />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {panel && (
          <aside className="queue-panel">
            {panel === 'queue' ? <QueuePanel /> : <LyricsPanel />}
          </aside>
        )}
      </div>
      <ToastHost />
      <PlayerBar />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SubsonicSession | null>(loadSession);

  const app = useMemo<AppContextValue | null>(() => {
    if (!session) return null;
    return {
      session,
      client: new SubsonicClient(transportSession(session)),
      cache: new MemoryCache(),
      logout: () => {
        clearSession();
        setSession(null);
      },
    };
  }, [session]);

  const player = usePlaybackEngine(app?.client ?? null);
  const { reset } = player;
  // A new account (or a logout) never sees the previous one's queue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reset(), [session?.username, session?.baseUrl]);

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
