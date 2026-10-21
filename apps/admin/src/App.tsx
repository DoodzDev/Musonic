/**
 * @file App.tsx
 * @description Routes of the console. The public link pages (invitation, password reset) work
 *   without signing in; everything else needs an administrator.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { api, session } from './api.ts';
import { Layout } from './components/Layout.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { AccountsPage } from './pages/AccountsPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DataPage } from './pages/DataPage.tsx';
import { PlaybackPage } from './pages/PlaybackPage.tsx';
import { ImportsPage } from './pages/ImportsPage.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { ActivityPage, AdminJournalPage } from './pages/JournalPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { LibraryShell } from './components/Listen.tsx';
import { LoginPage, NotAdminPage } from './pages/LoginPage.tsx';
import { ResetPage } from './pages/ResetPage.tsx';
import { SecurityPage } from './pages/SecurityPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TrackPage } from './pages/TrackPage.tsx';

export interface Me {
  id: string;
  username: string;
  is_admin: boolean;
}

export default function App() {
  // Without a session there is nobody to load.
  const [me, setMe] = useState<Me | null | undefined>(() => (session.token ? undefined : null));
  const load = useCallback(() => {
    if (!session.token) return;
    api<Me>('/v1/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  useEffect(load, [load]);
  const signOut = () => {
    void api('/v1/auth/logout', { method: 'POST' }).catch(() => {});
    session.clear();
    setMe(null);
  };

  const gate = (page: React.ReactElement) => {
    if (me === undefined) return <div className="public" />;
    if (me === null) return <Navigate to="/login" replace />;
    if (!me.is_admin) return <Navigate to="/not-admin" replace />;
    return <Layout me={me} onSignOut={signOut}>{page}</Layout>;
  };

  return (
    <Routes>
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/reset/:token" element={<ResetPage />} />
      <Route path="/login" element={me?.is_admin ? <Navigate to="/" replace /> : <LoginPage onSignedIn={load} />} />
      <Route path="/not-admin" element={<NotAdminPage onSignOut={signOut} />} />
      <Route path="/" element={gate(<DashboardPage />)} />
      <Route path="/accounts" element={gate(<AccountsPage />)} />
      <Route path="/accounts/:id" element={gate(<AccountPage me={me ?? null} />)} />
      <Route path="/security" element={gate(<SecurityPage />)} />
      <Route path="/library" element={gate(<LibraryShell />)}>
        <Route index element={<LibraryPage />} />
        <Route path=":id" element={<TrackPage />} />
      </Route>
      <Route path="/imports" element={gate(<ImportsPage />)} />
      <Route path="/playback" element={gate(<PlaybackPage />)} />
      <Route path="/data" element={gate(<DataPage />)} />
      <Route path="/settings" element={gate(<SettingsPage />)} />
      <Route path="/activity" element={gate(<ActivityPage />)} />
      <Route path="/journal" element={gate(<AdminJournalPage />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
