/**
 * @file App.tsx
 * @description Web client shell: login gate, routes, sidebar, right panel (queue or lyrics),
 *   player bar, full-screen player and floating mini player.
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Route, Routes } from 'react-router';
import { MemoryCache, SubsonicClient, type SubsonicSession } from '@musonic/core';
import { FullPlayer } from './components/FullPlayer.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { MiniPlayer } from './components/MiniPlayer.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { ProfileMenu } from './components/ProfileMenu.tsx';
import { ResizeHandle } from './components/ResizeHandle.tsx';
import { LyricsPanel } from './components/LyricsPanel.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { ToastHost } from './components/Toast.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { AppContext, type AppContextValue } from './context/AppContext.tsx';
import { usePanelWidth } from './hooks/usePanelWidth.ts';
import { useScrollMemory } from './hooks/useScrollMemory.ts';
import { tr } from './i18n/index.ts';
import { clearSession, loadSession, saveSession, transportSession } from './lib/session.ts';
import { AlbumPage } from './pages/AlbumPage.tsx';
import { ArtistPage } from './pages/ArtistPage.tsx';
import { BrowsePage } from './pages/BrowsePage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { GenrePage } from './pages/GenrePage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { MixPage } from './pages/MixPage.tsx';
import { MyMusicPage } from './pages/MyMusicPage.tsx';
import { LikedPage } from './pages/LikedPage.tsx';
import { PlaylistPage } from './pages/PlaylistPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { AudioEngine } from './player/AudioEngine.tsx';
import { PlayerContext, usePlayer } from './player/PlayerContext.tsx';
import { useMiniPlayerWindow } from './player/useMiniPlayerWindow.ts';
import { usePlaybackEngine } from './player/usePlaybackEngine.ts';

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  const { panel, current } = usePlayer();
  const [full, setFull] = useState(false);
  const mini = useMiniPlayerWindow();
  const sideWidth = usePanelWidth('musonic.sideWidth', { initial: 248, min: 200, max: 440 });
  const queueWidth = usePanelWidth('musonic.queueWidth', { initial: 320, min: 260, max: 600 });
  const toggleMini = mini.supported ? () => (mini.win ? mini.close() : void mini.open()) : null;
  useScrollMemory(mainRef);
  return (
    <AudioEngine>
      <div className="app">
        <div className="app-body">
          <aside className="side-panel" style={{ width: sideWidth.width }}>
            <Sidebar />
          </aside>
          <ResizeHandle panel={sideWidth} side="left" label={tr.layout.resize} />
          <div className="main-wrap">
            <div className="top-actions">
              <ProfileMenu />
            </div>
            <main className="main-panel" ref={mainRef}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/my-music" element={<MyMusicPage />} />
                <Route path="/genre/:name" element={<GenrePage />} />
                <Route path="/browse/:kind" element={<BrowsePage />} />
                <Route path="/mix/:genre" element={<MixPage />} />
                <Route path="/liked" element={<LikedPage />} />
                <Route path="/playlist/:id" element={<PlaylistPage />} />
                <Route path="/album/:id" element={<AlbumPage />} />
                <Route path="/artist/:id" element={<ArtistPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
          {panel && <ResizeHandle panel={queueWidth} side="right" label={tr.layout.resize} />}
          {panel && (
            <aside className="queue-panel" style={{ width: queueWidth.width }}>
              {panel === 'queue' ? <QueuePanel /> : <LyricsPanel />}
            </aside>
          )}
        </div>
        <ToastHost />
        <PlayerBar onExpand={() => setFull(true)} onToggleMini={toggleMini} miniOpen={!!mini.win} />
        {full && current && <FullPlayer onClose={() => setFull(false)} onToggleMini={toggleMini} miniOpen={!!mini.win} />}
      </div>
      {mini.win && createPortal(<MiniPlayer win={mini.win} />, mini.win.document.body)}
    </AudioEngine>
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
        onLogin={(next, remember) => {
          saveSession(next, remember);
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
