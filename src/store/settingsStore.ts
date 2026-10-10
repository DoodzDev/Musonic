/**
 * @file settingsStore.ts
 * @description Zustand + MMKV store for user preferences: server credentials,
 *   language, waveform display, crossfade, mono audio, rotation lock, landscape
 *   nav bar position, fullscreen mode (hides the OS status bar), and the
 *   landscape full-player cover/progress column order. Persisted across
 *   restarts; consumed by RootNavigator to gate the server-setup flow.
 * @author DoodzProg
 * @version 1.0.5
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';

export type ColorScheme = 'dark' | 'light' | 'system';
export type Locale = 'fr' | 'en';
export type LibrarySortMode = 'recent' | 'added' | 'alpha' | 'custom';
export type NavBarPosition = 'left' | 'right';
export type FullPlayerCoverSide = 'left' | 'right';

export type Server = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
};

type SettingsState = {
  servers: Server[];
  activeServerId: string | null;
  colorScheme: ColorScheme;
  accentColor: string;
  crossfadeDuration: number;
  setColorScheme: (scheme: ColorScheme) => void;
  setAccentColor: (color: string) => void;
  setCrossfadeDuration: (duration: number) => void;
  addServer: (server: Server) => void;
  removeServer: (id: string) => void;
  setActiveServer: (id: string) => void;
  disconnectServer: () => void;
  getActiveServer: () => Server | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  useWaveformScrubber: boolean;
  setUseWaveformScrubber: (use: boolean) => void;
  rotationLocked: boolean;
  setRotationLocked: (locked: boolean) => void;
  navBarPosition: NavBarPosition;
  setNavBarPosition: (position: NavBarPosition) => void;
  isFullscreenMode: boolean;
  setIsFullscreenMode: (enabled: boolean) => void;
  fullPlayerCoverSide: FullPlayerCoverSide;
  setFullPlayerCoverSide: (side: FullPlayerCoverSide) => void;
  isAutoplayEnabled: boolean;
  setIsAutoplayEnabled: (enabled: boolean) => void;
  isAutoDownloadEnabled: boolean;
  setIsAutoDownloadEnabled: (enabled: boolean) => void;
  isOfflineMode: boolean;
  setOfflineMode: (v: boolean) => void;
  autoOnlineMode: boolean;
  setAutoOnlineMode: (v: boolean) => void;
  shuffleMode: 'off' | 'on' | 'magic';
  setShuffleMode: (mode: 'off' | 'on' | 'magic') => void;
  repeatMode: 'none' | 'all' | 'one';
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  librarySortMode: LibrarySortMode;
  setLibrarySortMode: (mode: LibrarySortMode) => void;
  lastPlayedPlaylists: Record<string, number>;
  setLastPlayedPlaylist: (id: string, ts: number) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: null,
      colorScheme: 'system',
      accentColor: '#FF6B35',
      crossfadeDuration: 0,
      setColorScheme: scheme => set({colorScheme: scheme}),
      setAccentColor: color => set({accentColor: color}),
      setCrossfadeDuration: duration => set({crossfadeDuration: duration}),
      addServer: server =>
        set(state => ({servers: [...state.servers, server]})),
      removeServer: id =>
        set(state => ({servers: state.servers.filter(s => s.id !== id)})),
      setActiveServer: id => set({activeServerId: id}),
      disconnectServer: () => set({activeServerId: null}),
      locale: 'en',
      setLocale: locale => set({locale}),
      useWaveformScrubber: false,
      setUseWaveformScrubber: use => set({useWaveformScrubber: use}),
      rotationLocked: false,
      setRotationLocked: locked => set({rotationLocked: locked}),
      navBarPosition: 'left',
      setNavBarPosition: position => set({navBarPosition: position}),
      isFullscreenMode: false,
      setIsFullscreenMode: enabled => set({isFullscreenMode: enabled}),
      fullPlayerCoverSide: 'left',
      setFullPlayerCoverSide: side => set({fullPlayerCoverSide: side}),
      isAutoplayEnabled: true,
      setIsAutoplayEnabled: enabled => set({isAutoplayEnabled: enabled}),
      isAutoDownloadEnabled: false,
      setIsAutoDownloadEnabled: enabled => set({isAutoDownloadEnabled: enabled}),
      isOfflineMode: false,
      setOfflineMode: v => set({isOfflineMode: v}),
      autoOnlineMode: true,
      setAutoOnlineMode: v => set({autoOnlineMode: v}),
      shuffleMode: 'off',
      setShuffleMode: mode => set({shuffleMode: mode}),
      repeatMode: 'none',
      setRepeatMode: mode => set({repeatMode: mode}),
      librarySortMode: 'recent',
      setLibrarySortMode: mode => set({librarySortMode: mode}),
      lastPlayedPlaylists: {},
      setLastPlayedPlaylist: (id, ts) =>
        set(s => ({lastPlayedPlaylists: {...s.lastPlayedPlaylists, [id]: ts}})),
      getActiveServer: () => {
        const {servers, activeServerId} = get();
        return servers.find(s => s.id === activeServerId) ?? null;
      },
    }),
    {
      name: 'musonic-settings',
      storage: createJSONStorage(() => mmkvStorage),
      // Bump on any change to the persisted shape and handle the old version in `migrate`.
      // Without `migrate`, a version mismatch discards the stored data.
      version: 1,
      // v0 (unversioned) -> v1: same shape, versioning only.
      migrate: persistedState => persistedState as SettingsState,
    },
  ),
);
