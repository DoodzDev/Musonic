/**
 * @file androidAuto.ts
 * @description Android Auto (ADR-015): answers the car's browse requests from
 *   the same API and offline caches as the screens, and plays a tapped track
 *   through the playback engine (whole list, from that track). Also keeps the
 *   car's shuffle / repeat / like buttons in step with the player and runs
 *   their presses through the same store actions as the app's buttons.
 *   Tabs: Playlists (Liked songs first), Albums, Artists and Downloaded, in the
 *   order of the app's Library (its sort, pinned first); offline, only what is
 *   downloaded. A slow network falls back to the caches after 3 s.
 *   Every list the caches already hold is also sent to the native side as a
 *   snapshot (ADR-022 step 2): the car opens them at once, even with the app
 *   closed, and only an album's tracks or an artist's albums ask JS.
 *   Started by the playback service, so it also runs without the app's screens.
 * @author DoodzProg
 * @version 1.6.0
 * @license CC-BY-NC-4.0
 */
import {AppState, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import TrackPlayer, {Event} from '../player';
import {getCoverArtUrl, subsonicGet} from '../../api/client';
import {getAlbum, getAlbumsByArtist, getLyricsBySongId, getStarred} from '../../api/endpoints/library';
import {getPlaylist, getPlaylists} from '../../api/endpoints/playlists';
import type {SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong} from '../../api/types';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {usePlayerStore} from '../../store/playerStore';
import {useLibraryCacheStore} from '../../store/libraryCacheStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useRecentPlaysStore} from '../../store/recentPlaysStore';
import {sortEntries} from '../../screens/Library/libraryModel';
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
  LIKED,
  PLAYLISTS,
  QUEUE,
  RECENT,
  RESUME,
  ROOT,
  albumItems,
  albumNodeId,
  artistItems,
  likedItem,
  lyricsItems,
  parseNode,
  parseTrackRef,
  playlistItems,
  playlistNodeId,
  recentItems,
  searchNodeId,
  resumeItems,
  trackItems,
  type ArtOf,
  type AutoAction,
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
  /** `nodes`: node id → its items, covers by key only (kept on disk); `arts`: key → address (memory only). */
  setSnapshot(nodes: string, arts: Record<string, string>): void;
};

const native: Native | undefined = NativeModules.MusonicAuto;
let started = false;

/** Past this, a slow network answers from the caches instead: the car must not hang. */
const NETWORK_WAIT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, waitMs = NETWORK_WAIT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), waitMs);
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

/** Liked songs: fresh from the server when it answers in time, else the last ones fetched. */
async function loadLiked(): Promise<SubsonicSong[]> {
  const cached = usePlaylistCacheStore.getState().cachedLikedSongs;
  if (isOffline()) return cached;
  try {
    const {songs} = await withTimeout(getStarred());
    usePlaylistCacheStore.getState().setCachedLikedSongs(songs);
    return songs;
  } catch {
    return cached;
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

/** The car's tabs (at most 4, with their icon): the Library's own tabs. */
function rootItems(): AutoItem[] {
  const tabs = getT().library.tabs;
  const tab = (id: string, title: string, icon: string, grid: boolean): AutoItem =>
    ({id, title, browsable: true, grid, art: {key: `icon:${icon}`, uri: ''}});
  const playlists = tab(PLAYLISTS, tabs.playlists, 'tab_playlists', true);
  const downloads = tab(DOWNLOADS, tabs.downloads, 'tab_downloads', false);
  // Offline the app hides albums and artists too: nothing there could be played.
  if (isOffline()) return [playlists, downloads];
  return [playlists, tab(ALBUMS, tabs.albums, 'tab_albums', true), tab(ARTISTS, tabs.artists, 'tab_artists', true), downloads];
}

/** Kept for a car that still asks for the old Library node: the same tabs, as a list. */
const libraryItems = rootItems;

/** Items in the order of the app's Library: its sort (Recent: last played first), pinned first. */
function inLibraryOrder<T extends {id: string; name: string}>(kind: 'playlist' | 'album' | 'artist', items: T[]): T[] {
  const {librarySortMode, pinnedLibraryIds} = useSettingsStore.getState();
  const playedAt: Record<string, number> = {...usePlayerStore.getState().lastPlayedPlaylists};
  for (const p of useRecentPlaysStore.getState().plays) {
    if (p.kind === kind) playedAt[p.id] = Math.max(playedAt[p.id] ?? 0, p.playedAt);
  }
  const byId = new Map(items.map(i => [String(i.id), i]));
  const entries = items.map(i => ({kind, id: String(i.id), name: i.name}));
  return sortEntries(entries, librarySortMode, playedAt, new Set(pinnedLibraryIds)).map(e => byId.get(e.id) as T);
}

function playlistsItems(all: SubsonicPlaylist[]): AutoItem[] {
  const {cachedPlaylistSongs: cached, cachedLikedSongs: liked} = usePlaylistCacheStore.getState();
  const shown = isOffline()
    ? all.filter(p => (cached[String(p.id)] ?? []).some(s => isTrackDownloaded(String(s.id))))
    : all;
  const t = getT().likedSongs;
  const likedPlayable = playable(liked);
  const items = playlistItems(inLibraryOrder('playlist', shown), t.trackCount, isPlaylistDownloaded, artOf);
  // Offline, Liked songs shows only when some are downloaded, like any playlist.
  if (isOffline() && likedPlayable.length === 0) return items;
  const allDownloaded = liked.length > 0 && liked.every(s => isTrackDownloaded(String(s.id)));
  return [likedItem(t.title, t.trackCount(likedPlayable.length), allDownloaded), ...items];
}

const likedTracks = (songs: SubsonicSong[]): AutoItem[] => trackItems(LIKED, playable(songs), isTrackDownloaded, artOf);

const albumsItems = (): AutoItem[] =>
  isOffline() ? [] : albumItems(inLibraryOrder('album', useLibraryCacheStore.getState().albums), artOf);
const artistsItems = (): AutoItem[] =>
  isOffline() ? [] : artistItems(inLibraryOrder('artist', useLibraryCacheStore.getState().artists), artOf);
const downloadsItems = (): AutoItem[] => trackItems(DOWNLOADS, downloadedSongs(), isTrackDownloaded, artOf);

/** Home of the car: the track to resume, under the name of what it plays. */
function homeResumeItems(): AutoItem[] {
  const {queue, currentPlaylistName} = usePlayerStore.getState();
  const current = queue[0];
  return resumeItems(current && {...current, id: String(current.id)}, currentPlaylistName ?? undefined, artOf);
}

/** Home of the car: the lists played lately, at most one screen of them. */
function homeRecentItems(): AutoItem[] {
  const t = getT().likedSongs;
  const liked = playable(usePlaylistCacheStore.getState().cachedLikedSongs);
  const items = recentItems(useRecentPlaysStore.getState().plays, {title: t.title, subtitle: t.trackCount(liked.length)}, isOffline(), artOf);
  return items.slice(0, RECENT_SHOWN);
}

const RECENT_SHOWN = 8;

/** What comes after the track playing, as the app's queue shows it. */
function queueItems(): AutoItem[] {
  const songs = usePlayerStore.getState().upcoming.slice(0, QUEUE_SHOWN).map(t => ({...t, id: String(t.id)}));
  return trackItems(QUEUE, songs, isTrackDownloaded, artOf);
}

const QUEUE_SHOWN = 30;

type Found = {songs: SubsonicSong[]; albums: SubsonicAlbum[]; artists: SubsonicArtist[]};

/**
 * Only what the car shows, so the answer is fast; online results may need more time than a
 * list, but the car gives up after 8 s.
 */
async function carSearch(query: string): Promise<Found> {
  const res = await withTimeout(
    subsonicGet<any>('search3.view', {query, songCount: SEARCH_SONGS, albumCount: SEARCH_OTHERS, artistCount: SEARCH_OTHERS}),
    SEARCH_WAIT_MS,
  );
  const found = res.searchResult3 ?? {};
  return {songs: found.song ?? [], albums: found.album ?? [], artists: found.artist ?? []};
}

const SEARCH_WAIT_MS = 7000;

/** Search in the car: songs first (a tap plays them all from there), then albums and artists. */
async function searchItems(query: string): Promise<AutoItem[]> {
  const found = await carSearch(query);
  return [
    ...trackItems(searchNodeId(query), playable(found.songs).slice(0, SEARCH_SONGS), isTrackDownloaded, artOf),
    ...(isOffline() ? [] : albumItems(found.albums.slice(0, SEARCH_OTHERS), artOf)),
    ...(isOffline() ? [] : artistItems(found.artists.slice(0, SEARCH_OTHERS), artOf)),
  ];
}

const SEARCH_SONGS = 10;
const SEARCH_OTHERS = 5;

/** Lyrics of a track, as the app's player loads them (embedded, then the server, then LRCLIB). */
async function lyricsOf(trackId: string): Promise<AutoItem[]> {
  const track = usePlayerStore.getState().queue.find(t => String(t.id) === trackId);
  // Slower than lists: the online sources may be needed.
  return lyricsItems(await getLyricsBySongId(trackId, track?.artist, track?.title, track?.duration));
}

async function children(parentId: string): Promise<AutoItem[]> {
  const node = parseNode(parentId);
  switch (node.kind) {
    case 'root':
      return rootItems();
    case 'library':
      return libraryItems();
    case 'playlists':
      return playlistsItems(await loadPlaylists());
    case 'playlist': {
      const {songs} = await loadPlaylist(node.id);
      return trackItems(playlistNodeId(node.id), playable(songs), isTrackDownloaded, artOf);
    }
    case 'albums':
      return albumsItems();
    case 'album': {
      const {songs} = await loadAlbum(node.id);
      return trackItems(albumNodeId(node.id), playable(songs), isTrackDownloaded, artOf);
    }
    case 'artists':
      return artistsItems();
    case 'artist':
      try {
        return albumItems(await withTimeout(getAlbumsByArtist(node.id)), artOf);
      } catch {
        return [];
      }
    case 'downloads':
      return downloadsItems();
    case 'liked':
      return likedTracks(await loadLiked());
    case 'resume':
      return homeResumeItems();
    case 'recent':
      return homeRecentItems();
    case 'queue':
      return queueItems();
    case 'lyrics':
      return lyricsOf(node.id);
    case 'search':
      return searchItems(node.query);
    default:
      return [];
  }
}

/** Every list the caches hold, as the car shows it: no network, no wait. */
function snapshotNodes(): Record<string, AutoItem[]> {
  const cache = usePlaylistCacheStore.getState();
  const nodes: Record<string, AutoItem[]> = {
    [ROOT]: rootItems(),
    [LIBRARY]: libraryItems(),
    [PLAYLISTS]: playlistsItems(cache.cachedPlaylists),
    [DOWNLOADS]: downloadsItems(),
    [LIKED]: likedTracks(cache.cachedLikedSongs),
    [RESUME]: homeResumeItems(),
    [RECENT]: homeRecentItems(),
  };
  for (const p of cache.cachedPlaylists) {
    const songs = cache.cachedPlaylistSongs[String(p.id)];
    if (songs) nodes[playlistNodeId(String(p.id))] = trackItems(playlistNodeId(String(p.id)), playable(songs), isTrackDownloaded, artOf);
  }
  if (!isOffline()) {
    nodes[ALBUMS] = albumsItems();
    nodes[ARTISTS] = artistsItems();
  }
  return nodes;
}

let snapshotDirty = true;
let sentSnapshot = '';
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

/** Sends the snapshot if the caches changed since the last one. */
function publishSnapshot(module: Native): void {
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  if (!snapshotDirty) return;
  snapshotDirty = false;
  try {
    const arts: Record<string, string> = {};
    const nodes = snapshotNodes();
    // Addresses of covers may hold credentials: they stay in memory, the file only keeps keys.
    for (const items of Object.values(nodes)) {
      for (const item of items) {
        if (!item.art) continue;
        if (item.art.uri) arts[item.art.key] = item.art.uri;
        item.art = {key: item.art.key, uri: ''};
      }
    }
    const json = JSON.stringify(nodes);
    if (json === sentSnapshot) return;
    sentSnapshot = json;
    module.setSnapshot(json, arts);
  } catch {
    console.warn('[auto] snapshot failed');
  }
}

/** A cache changed: the snapshot is sent a little later (several changes come together). */
function markSnapshotDirty(module: Native): void {
  snapshotDirty = true;
  if (!snapshotTimer) snapshotTimer = setTimeout(() => publishSnapshot(module), SNAPSHOT_DELAY_MS);
}

/** Lets downloads and library refreshes settle before rebuilding the snapshot. */
const SNAPSHOT_DELAY_MS = 5000;

/** The list behind a track tapped in the car, as the engine plays it. */
async function loadList(list: AutoList): Promise<{source: PlaySource; songs: SubsonicSong[]}> {
  if (list.kind === 'downloads') {
    return {source: {type: 'other', name: getT().library.tabs.downloads}, songs: downloadedSongs()};
  }
  if (list.kind === 'liked') {
    return {source: {type: 'other', name: getT().likedSongs.title}, songs: playable(await loadLiked())};
  }
  if (list.kind === 'search') {
    const found = await carSearch(list.query);
    return {source: {type: 'other', name: list.query}, songs: playable(found.songs).slice(0, SEARCH_SONGS)};
  }
  const {name, songs} = list.kind === 'playlist' ? await loadPlaylist(list.id) : await loadAlbum(list.id);
  return {source: {type: list.kind, id: list.id, name}, songs: playable(songs)};
}

/** Plays a track tapped in the car: its whole list, starting on it. */
export async function playAutoMediaId(mediaId: string): Promise<void> {
  // Resume on the car's Home: the queue as it is (loaded first if the car started the app).
  if (mediaId === RESUME) {
    await playbackEngine.restore();
    await TrackPlayer.play();
    return;
  }
  const ref = parseTrackRef(mediaId);
  if (!ref) return;
  const {source, songs} = await loadList(ref.list);
  if (songs.length === 0) return;
  await playbackEngine.playContext({source, tracks: songs.map(songToTrack), startTrackId: ref.trackId});
}

/** « Play … on Musonic », said to the car's assistant: the songs found, from the first. */
export async function playAutoSearch(query: string): Promise<void> {
  if (!query.trim()) return;
  const {source, songs} = await loadList({kind: 'search', query});
  if (songs.length === 0) return;
  await playbackEngine.playContext({source, tracks: songs.map(songToTrack)});
}

/**
 * Play or Shuffle pressed on a playlist or an album in the car: the whole list from its
 * start, as the app's own buttons do (Shuffle turns shuffle on, Magic stays Magic).
 */
export async function playAutoList(nodeId: string, action: AutoAction): Promise<void> {
  const node = parseNode(nodeId);
  if (node.kind !== 'playlist' && node.kind !== 'album' && node.kind !== 'liked') return;
  const {source, songs} = await loadList(node);
  if (songs.length === 0) return;
  if (action === 'shuffle' && usePlayerStore.getState().shuffleMode === 'off') {
    await playbackEngine.setShuffleMode('on');
  }
  await playbackEngine.playContext({source, tracks: songs.map(songToTrack)});
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
  // A track tapped on Musonic's own car screens (templated app, ADR-025).
  emitter.addListener('musonic-auto-play', ({mediaId}: {mediaId: string}) => {
    playAutoMediaId(mediaId).catch(() => console.warn('[auto] play failed'));
  });
  emitter.addListener('musonic-auto-browse-action', ({action, mediaId}: {action: AutoAction; mediaId: string}) => {
    playAutoList(mediaId, action).catch(() => console.warn('[auto] browse action failed', action));
  });
  // The snapshot follows the caches; it is also sent at once when the car connects and when
  // the app leaves the screen, so the file is fresh for the next drive.
  const dirty = () => markSnapshotDirty(module);
  usePlaylistCacheStore.subscribe(dirty);
  useLibraryCacheStore.subscribe(dirty);
  useDownloadStore.subscribe((s, prev) => {
    if (s.downloads !== prev.downloads) dirty();
  });
  useSettingsStore.subscribe((s, prev) => {
    if (
      s.isOfflineMode !== prev.isOfflineMode || s.locale !== prev.locale || s.activeServerId !== prev.activeServerId ||
      s.librarySortMode !== prev.librarySortMode || s.pinnedLibraryIds !== prev.pinnedLibraryIds
    ) dirty();
  });
  // Last played lists come first with the Recent sort.
  useRecentPlaysStore.subscribe(dirty);
  usePlayerStore.subscribe((s, prev) => {
    if (s.lastPlayedPlaylists !== prev.lastPlayedPlaylists || s.queue[0]?.id !== prev.queue[0]?.id) dirty();
  });
  emitter.addListener('musonic-auto-connected', () => publishSnapshot(module));
  AppState.addEventListener('change', state => {
    if (state === 'background') publishSnapshot(module);
  });
  setTimeout(() => publishSnapshot(module), SNAPSHOT_DELAY_MS);
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
