/**
 * @file RootNavigator.tsx
 * @description Root navigator. Gates between ServerSetup (no credentials) and
 *   the main tabs wrapped in ProfileProvider. Locks screen orientation based on user settings,
 *   controls global fullscreen mode (OS status bar visibility), manages the
 *   full-screen player overlay, and clears per-account local caches (playlist
 *   membership, search history) when the active server/account changes, and
 *   checks the optional Musonic API at launch and when its settings change,
 *   and trades the passwords of saved accounts for device keys or tokens at
 *   launch (ADR-021).
 *   Debug builds also register the Design v2 reference screen and its
 *   track-list and large-title demos.
 * @author DoodzProg
 * @version 1.7.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef} from 'react';
import {StatusBar} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import Orientation from 'react-native-orientation-locker';
import {useSettingsStore} from '../store/settingsStore';
import {configureClient} from '../api/client';
import {checkMusonicApi} from '../api/musonicApi';
import {upgradeSavedAccounts} from '../api/accountAuth';
import {usePlaylistCacheStore, fetchAndCachePlaylistSongs} from '../store/playlistCacheStore';
import {useSearchHistoryStore} from '../store/searchHistoryStore';
import TabNavigator from './TabNavigator';
import ProfileProvider from '../components/ProfileProvider';
import ServerSetupScreen from '../screens/ServerSetup';
import SettingsScreen from '../screens/Settings';
import DesignScreen from '../screens/Design';
import DesignTrackListTest from '../screens/Design/TrackListTest';
import DesignHeaderTest from '../screens/Design/HeaderTest';

const Stack = createNativeStackNavigator();

function MainWithProfile() {
  return (
    <ProfileProvider>
      <TabNavigator />
    </ProfileProvider>
  );
}

export default function RootNavigator() {
  // Atomic selectors: the root must not re-render on unrelated settings writes.
  const activeServer = useSettingsStore(s => s.servers.find(x => x.id === s.activeServerId) ?? null);
  const rotationLocked = useSettingsStore(s => s.rotationLocked);
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);

  const musonicApiUrl = useSettingsStore(s => s.musonicApiUrl);
  const musonicApiKey = useSettingsStore(s => s.musonicApiKey);

  if (activeServer) {
    configureClient(activeServer);
  }

  useEffect(() => {
    checkMusonicApi();
  }, [musonicApiUrl, musonicApiKey]);

  useEffect(() => {
    upgradeSavedAccounts();
  }, []);

  useEffect(() => {
    if (rotationLocked) {
      Orientation.lockToPortrait();
    } else {
      Orientation.unlockAllOrientations();
    }
  }, [rotationLocked]);

  // Per-account local caches: playlist membership + search history are cached
  // in MMKV keyed by a fixed name (not per-server), so switching the active
  // account on the same device would otherwise leak the previous account's
  // data (e.g. "already in playlist" checkmarks from someone else's playlists).
  const prevServerIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentId = activeServer?.id ?? null;
    if (prevServerIdRef.current !== undefined && prevServerIdRef.current !== currentId) {
      usePlaylistCacheStore.setState({
        savedTrackIds: [],
        savedSet: new Set(),
        cachedPlaylists: [],
        cachedPlaylistSongs: {},
      });
      useSearchHistoryStore.getState().clearHistory();
      if (currentId) fetchAndCachePlaylistSongs().catch(() => {});
    }
    prevServerIdRef.current = currentId;
  }, [activeServer?.id]);

  return (
    <>
      {/* Global fullscreen-mode control — a single source of truth for
          hiding the OS status bar (clock/wifi/battery/notifications), rather
          than fighting per-screen <StatusBar barStyle=.../> calls which only
          ever set barStyle/backgroundColor, never `hidden`. */}
      <StatusBar hidden={isFullscreenMode} animated />
      <Stack.Navigator screenOptions={{headerShown: false}}>
      {!activeServer ? (
        <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainWithProfile} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{animation: 'slide_from_right'}} />
          {/* Design v2 reference screen: debug builds (Musonic Dev) only. */}
          {__DEV__ && <Stack.Screen name="Design" component={DesignScreen} />}
          {__DEV__ && <Stack.Screen name="DesignTrackList" component={DesignTrackListTest} />}
          {__DEV__ && <Stack.Screen name="DesignHeaderTest" component={DesignHeaderTest} />}
        </>
      )}
      </Stack.Navigator>
    </>
  );
}
