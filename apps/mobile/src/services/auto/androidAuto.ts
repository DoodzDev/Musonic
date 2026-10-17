/**
 * @file androidAuto.ts
 * @description Android Auto (ADR-015): answers the car's browse requests from
 *   the same API and offline caches as the screens, and plays a tapped track
 *   through the playback engine (whole list, from that track). Also keeps the
 *   car's shuffle / repeat / like buttons in step with the player and runs
 *   their presses through the same store actions as the app's buttons.
 *   Started by the playback service, so it also runs without the app's screens.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import TrackPlayer, {Event} from 'react-native-track-player';
import {getCoverArtUrl} from '../../api/client';
import {getPlaylist, getPlaylists} from '../../api/endpoints/playlists';
import type {SubsonicPlaylist, SubsonicSong} from '../../api/types';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {usePlayerStore} from '../../store/playerStore';
import {songToTrack} from '../../utils/songToTrack';
import {playbackEngine} from '../playback/engine';
import {getT} from '../../i18n';
import {withoutHaptics} from '../haptics';
import {
  LIBRARY,
  PLAYLISTS,
  parseNode,
  parseTrackRef,
  playlistItems,
  playlistNodeId,
  trackItems,
  type ArtOf,
  type AutoItem,
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

async function loadPlaylists(): Promise<SubsonicPlaylist[]> {
  try {
    return await getPlaylists();
  } catch {
    return usePlaylistCacheStore.getState().cachedPlaylists;
  }
}

async function loadPlaylist(id: string): Promise<{name?: string; songs: SubsonicSong[]}> {
  try {
    const {playlist, songs} = await getPlaylist(id);
    return {name: playlist?.name, songs};
  } catch {
    const cache = usePlaylistCacheStore.getState();
    return {
      name: cache.cachedPlaylists.find(p => String(p.id) === id)?.name,
      songs: cache.getOfflineSongs(id),
    };
  }
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
    case 'library':
      return [{id: PLAYLISTS, title: t.library.tabs.playlists, browsable: true, grid: true}];
    case 'playlists':
      return playlistItems(await loadPlaylists(), t.likedSongs.trackCount, isPlaylistDownloaded, artOf);
    case 'playlist': {
      const {songs} = await loadPlaylist(node.id);
      return trackItems(playlistNodeId(node.id), songs, isTrackDownloaded, artOf);
    }
    default:
      return [];
  }
}

/** Plays a track tapped in the car: its whole list, starting on it. */
export async function playAutoMediaId(mediaId: string): Promise<void> {
  const ref = parseTrackRef(mediaId);
  if (!ref) return;
  const {name, songs} = await loadPlaylist(ref.list.id);
  if (songs.length === 0) return;
  await playbackEngine.playContext({
    source: {type: 'playlist', id: ref.list.id, name},
    tracks: songs.map(songToTrack),
    startTrackId: ref.trackId,
  });
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
