/**
 * @file androidAuto.ts
 * @description Android Auto (ADR-015): answers the car's browse requests from
 *   the same API and offline caches as the screens, and plays a tapped track
 *   through the playback engine (whole list, from that track). Also keeps the
 *   car's shuffle / repeat / like buttons in step with the player and runs
 *   their presses through the same store actions as the app's buttons.
 *   Library: Playlists, Albums, Artists and Downloaded, like the app; offline,
 *   only what is downloaded. A slow network falls back to the caches after 3 s.
 *   Started by the playback service, so it also runs without the app's screens.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import TrackPlayer, {Event} from 'react-native-track-player';
import {getCoverArtUrl} from '../../api/client';
import {getAlbum, getAlbumsByArtist} from '../../api/endpoints/library';
import {getPlaylist, getPlaylists} from '../../api/endpoints/playlists';
import type {SubsonicPlaylist, SubsonicSong} from '../../api/types';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {usePlayerStore} from '../../store/playerStore';
import {useLibraryCacheStore} from '../../store/libraryCacheStore';
import {useSettingsStore} from '../../store/settingsStore';
import type {PlaySource} from '../playback/buildQueue';
import {songToTrack} from '../../utils/songToTrack';
import {playbackEngine} from '../playback/engine';
import {getT} from '../../i18n';
import {withoutHaptics} from '../haptics';
import {
  ALBUMS,
  ARTISTS,
  DOWNLOADS,
  LIBRARY,
  PLAYLISTS,
  albumItems,
  albumNodeId,
  artistItems,
  parseNode,
  parseTrackRef,
  playlistItems,
  playlistNodeId,
  trackItems,
  type ArtOf,
  type AutoItem,
  type AutoList,
} from './autoTree';

type ActionsState = {
  shuffle: string;
  repeat: string;
  /** null: nothing playing, no like button. */
  liked: boolean | null;
  labels: Record<string, string>;
};

type Native = {
  ready(): void;
  resolveChildren(requestId: string, items: AutoItem[]): void;
  setActions(state: ActionsState): void;
};

const native: Native | undefined = NativeModules.MusonicAuto;
let started = false;

/** Past this, a slow network answers from the caches instead: the car must not hang. */
const NETWORK_WAIT_MS = 3000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_WAIT_MS);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

const isOffline = () => useSettingsStore.getState().isOfflineMode;

async function loadPlaylists(): Promise<SubsonicPlaylist[]> {
  const cached = usePlaylistCacheStore.getState().cachedPlaylists;
  if (isOffline()) return cached;
  try {
    return await withTimeout(getPlaylists());
  } catch {
    return cached;
  }
}

async function loadPlaylist(id: string): Promise<{name?: string; songs: SubsonicSong[]}> {
  const cache = usePlaylistCacheStore.getState();
  const fromCache = () => ({
    name: cache.cachedPlaylists.find(p => String(p.id) === id)?.name,
    songs: cache.getOfflineSongs(id),
  });
  if (isOffline()) return fromCache();
  try {
    const {playlist, songs} = await withTimeout(getPlaylist(id));
    return {name: playlist?.name, songs};
  } catch {
    return fromCache();
  }
}

async function loadAlbum(id: string): Promise<{name?: string; songs: SubsonicSong[]}> {
  try {
    const {album, songs} = await withTimeout(getAlbum(id));
    return {name: album?.name, songs};
  } catch {
    return {songs: []};
  }
}

/** Downloaded tracks, most recent first (the app's Downloaded tab). */
function downloadedSongs(): SubsonicSong[] {
  return Object.values(useDownloadStore.getState().downloads)
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .map(d => ({
      id: d.trackId,
      title: d.title,
      artist: d.artist,
      album: d.album,
      coverArt: d.coverArt,
      duration: d.duration,
    }) as SubsonicSong);
}

/** Offline, only what can be played: downloaded tracks (the engine filters the same way). */
function playable(songs: SubsonicSong[]): SubsonicSong[] {
  return isOffline() ? songs.filter(s => isTrackDownloaded(String(s.id))) : songs;
}

/** Same size as the app's grids: sharp enough for the car, light to download. */
const ART_SIZE = 300;

const artOf: ArtOf = coverArt => {
  if (!coverArt) return undefined;
  try {
    return {key: `${coverArt}_${ART_SIZE}`, uri: getCoverArtUrl(coverArt, ART_SIZE)};
  } catch {
    return undefined; // no server configured
  }
};

const isTrackDownloaded = (trackId: string) => useDownloadStore.getState().isDownloaded(trackId);

/** A playlist shows the badge once every song known offline is downloaded. */
function isPlaylistDownloaded(playlistId: string): boolean {
  const songs = usePlaylistCacheStore.getState().cachedPlaylistSongs[playlistId];
  return !!songs?.length && songs.every(s => isTrackDownloaded(String(s.id)));
}

async function children(parentId: string): Promise<AutoItem[]> {
  const t = getT();
  const node = parseNode(parentId);
  switch (node.kind) {
    case 'root':
      return [{id: LIBRARY, title: t.tabs.library, browsable: true}];
    case 'library': {
      const tabs = t.library.tabs;
      const playlists: AutoItem = {id: PLAYLISTS, title: tabs.playlists, browsable: true, grid: true};
      const downloads: AutoItem = {id: DOWNLOADS, title: tabs.downloads, browsable: true};
      // Offline the app hides albums and artists too: nothing there could be played.
      if (isOffline()) return [playlists, downloads];
      return [
        playlists,
        {id: ALBUMS, title: tabs.albums, browsable: true, grid: true},
        {id: ARTISTS, title: tabs.artists, browsable: true, grid: true},
        downloads,
      ];
    }
    case 'playlists': {
      const all = await loadPlaylists();
      const cached = usePlaylistCacheStore.getState().cachedPlaylistSongs;
      const shown = isOffline()
        ? all.filter(p => (cached[String(p.id)] ?? []).some(s => isTrackDownloaded(String(s.id))))
        : all;
      return playlistItems(shown, t.likedSongs.trackCount, isPlaylistDownloaded, artOf);
    }
    case 'playlist': {
      const {songs} = await loadPlaylist(node.id);
      return trackItems(playlistNodeId(node.id), playable(songs), isTrackDownloaded, artOf);
    }
    case 'albums':
      return isOffline() ? [] : albumItems(useLibraryCacheStore.getState().albums, artOf);
    case 'album': {
      const {songs} = await loadAlbum(node.id);
      return trackItems(albumNodeId(node.id), playable(songs), isTrackDownloaded, artOf);
    }
    case 'artists':
      return isOffline() ? [] : artistItems(useLibraryCacheStore.getState().artists, artOf);
    case 'artist':
      try {
        return albumItems(await withTimeout(getAlbumsByArtist(node.id)), artOf);
      } catch {
        return [];
      }
    case 'downloads':
      return trackItems(DOWNLOADS, downloadedSongs(), isTrackDownloaded, artOf);
    default:
      return [];
  }
}

/** The list behind a track tapped in the car, as the engine plays it. */
async function loadList(list: AutoList): Promise<{source: PlaySource; songs: SubsonicSong[]}> {
  if (list.kind === 'downloads') {
    return {source: {type: 'other', name: getT().library.tabs.downloads}, songs: downloadedSongs()};
  }
  const {name, songs} = list.kind === 'playlist' ? await loadPlaylist(list.id) : await loadAlbum(list.id);
  return {source: {type: list.kind, id: list.id, name}, songs: playable(songs)};
}

/** Plays a track tapped in the car: its whole list, starting on it. */
export async function playAutoMediaId(mediaId: string): Promise<void> {
  const ref = parseTrackRef(mediaId);
  if (!ref) return;
  const {source, songs} = await loadList(ref.list);
  if (songs.length === 0) return;
  await playbackEngine.playContext({source, tracks: songs.map(songToTrack), startTrackId: ref.trackId});
}

let activeTrackId: string | null = null;
let sentActions = '';

/** Sends the buttons' state to the car, only when it changed. */
function pushActions(module: Native, force = false): void {
  const {shuffleMode, repeatMode, likedSongIds, localLikeOverrides} = usePlayerStore.getState();
  const liked = activeTrackId ? (localLikeOverrides[activeTrackId] ?? likedSongIds.has(activeTrackId)) : null;
  const t = getT().fullScreenPlayer;
  const state: ActionsState = {
    shuffle: shuffleMode,
    repeat: repeatMode,
    liked,
    labels: {
      shuffleOff: t.shuffleOff,
      shuffleOn: t.shuffleOn,
      shuffleMagic: t.shuffleMagic,
      repeatOff: t.repeatOff,
      repeatAll: t.repeatAll,
      repeatOne: t.repeatOne,
      like: t.like,
      unlike: t.unlike,
    },
  };
  const key = JSON.stringify(state);
  if (!force && key === sentActions) return;
  sentActions = key;
  module.setActions(state);
}

/** A button pressed in the car: the app's own action, without vibrating the phone. */
async function onAction(action: string): Promise<void> {
  const player = usePlayerStore.getState();
  if (action === 'musonic.shuffle') withoutHaptics(player.toggleShuffle);
  else if (action === 'musonic.repeat') withoutHaptics(player.cycleRepeat);
  else if (action === 'musonic.like') {
    const track = await TrackPlayer.getActiveTrack();
    if (track?.id == null) return;
    await withoutHaptics(() => player.toggleLike(String(track.id), track.title, track.artist));
  }
}

/** Listens for the car's browse requests and buttons. Safe to call more than once. */
export function startAndroidAuto(): void {
  if (started || Platform.OS !== 'android' || !native) return;
  started = true;
  const module = native;
  const emitter = new NativeEventEmitter(NativeModules.MusonicAuto);
  emitter.addListener(
    'musonic-auto-children',
    ({requestId, parentId}: {requestId: string; parentId: string}) => {
      children(parentId)
        .catch(() => {
          // Only the node: an API error may quote a URL holding credentials.
          console.warn('[auto] browse failed', parentId);
          return [];
        })
        .then(items => module.resolveChildren(requestId, items));
    },
  );
  emitter.addListener('musonic-auto-action', ({action}: {action: string}) => {
    onAction(action).catch(() => console.warn('[auto] action failed', action));
  });
  usePlayerStore.subscribe(() => pushActions(module));
  // The player rewrites its buttons when its notification is created: send ours again on
  // every track change.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, ({track}) => {
    activeTrackId = track?.id != null ? String(track.id) : null;
    pushActions(module, true);
  });
  TrackPlayer.getActiveTrack()
    .then(track => {
      activeTrackId = track?.id != null ? String(track.id) : null;
    })
    .catch(() => {})
    .finally(() => pushActions(module, true));
  module.ready();
}
