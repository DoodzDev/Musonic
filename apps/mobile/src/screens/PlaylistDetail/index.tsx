/**
 * @file index.tsx
 * @description Playlist screen (Design v2, R5.5). Cover, name, "By owner ·
 *   N songs · length" (with the Downloaded badge); Play (Pause when this
 *   playlist plays), Shuffle and Edit; a search field; the tracks (shared
 *   `TrackRow`: like, add to a playlist, download, long press = track menu);
 *   then online recommendations to add (offline: other downloaded tracks).
 *   Edit mode: drag handles to reorder, red circles to remove, then Save.
 *   Play and track taps go through the playback engine (`playContext`).
 * @author DoodzProg
 * @version 2.0.1
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import TrackPlayer, {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import ReorderableList, {
  reorderItems,
  useIsActive,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {GlassButton, PlayShuffleRow, SquareButton} from '../../components/detail/DetailParts';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import Badge from '../../components/ui/Badge';
import SearchField from '../../components/ui/SearchField';
import SectionHeader from '../../components/ui/SectionHeader';
import EmptyState from '../../components/ui/EmptyState';
import GlassSurface from '../../components/ui/GlassSurface';
import PressableScale from '../../components/ui/PressableScale';
import CoverArt from '../../components/CoverArt';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import PlaylistOptionsSheet from '../../components/PlaylistOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import PlaylistInfoModal from '../../components/PlaylistInfoModal';
import {showToast} from '../../components/Toast';
import {DotsHorizontalIcon, DragHandleIcon, MinusCircleIcon, PencilIcon, PlusIcon} from '../../components/icons';
import {getPlaylist, replacePlaylist, updatePlaylist} from '../../api/endpoints/playlists';
import {getDeezerArtistId, getDeezerArtistTopTracks, enrichTracksWithAlbumType, type DeezerTrack} from '../../api/deezer';
import {getCoverArtUrl, getStreamUrl, subsonicGet} from '../../api/client';
import {playbackEngine} from '../../services/playback/engine';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {fetchAndCachePlaylistSongs, usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore, type DownloadedTrack} from '../../store/downloadStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, radii, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';

const COVER = 232;
const SIDE_COVER = 128;
const RECO_COUNT = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

function deezerToTrack(t: DeezerTrack): Track {
  const sid = `ext-deezer-song-${t.id}`;
  return {
    id: sid, title: t.title, artist: t.artist.name, album: t.album.title,
    duration: t.duration, coverArt: sid,
    streamUrl: getStreamUrl(sid), url: getStreamUrl(sid),
    artwork: getCoverArtUrl(sid, 300), artistId: undefined,
  };
}

/** Playlist songs as playable tracks (local files are picked at load time). */
function songsToTracks(songs: SubsonicSong[]): Track[] {
  return songs.map(s => ({
    id: String(s.id),
    title: s.title || getT().home.unknownTitle,
    artist: s.artist || getT().home.unknownArtist,
    album: s.album || 'Single',
    duration: s.duration || 0,
    coverArt: s.coverArt || s.id,
    artistId: s.artistId,
    streamUrl: getStreamUrl(s.id),
    url: getStreamUrl(s.id),
    artwork: getCoverArtUrl(s.coverArt || s.id, 300),
  }));
}

function lengthLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// ─── Recommendation row ───────────────────────────────────────────────────────

function RecoRow({track, onPress, onAdd}: {track: DeezerTrack; onPress: () => void; onAdd: () => void}) {
  const t = useT();
  return (
    <Pressable onPress={onPress} android_ripple={{color: colors.fill}} style={styles.reco} accessibilityRole="button" accessibilityLabel={`${track.title}, ${track.artist.name}`}>
      <CoverArt imageUrl={track.album.cover_medium} size={48} borderRadius={radii.cover} />
      <View style={styles.recoText}>
        <Text variant="callout" numberOfLines={1} style={styles.recoTitle}>{track.title}</Text>
        <View style={styles.recoMeta}>
          <Badge kind="online" size="small" />
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.recoArtist}>{track.artist.name}</Text>
        </View>
      </View>
      <PressableScale onPress={onAdd} haptic="light" hitSlop={8} accessibilityLabel={t.playlistDetail.addReco(track.title)} style={styles.recoAdd}>
        <PlusIcon size={16} color={colors.accent} strokeWidth={2.6} />
      </PressableScale>
    </Pressable>
  );
}

// ─── Edit mode ────────────────────────────────────────────────────────────────

/** A row of the edit list. `key` stays stable while dragging, even when the playlist holds the same song twice. */
interface EditItem {
  key: string;
  song: SubsonicSong;
}

const EditRow = React.memo(function EditRow({item, onRemove}: {item: EditItem; onRemove: (key: string) => void}) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  const {song} = item;
  return (
    <View style={[styles.editRow, isActive && styles.editRowActive]}>
      <PressableScale onPress={() => onRemove(item.key)} hitSlop={8} accessibilityLabel={`${getT().songOptions.removeFromPlaylist}: ${song.title}`}>
        <MinusCircleIcon size={24} color={colors.destructive} filled />
      </PressableScale>
      <CoverArt id={song.coverArt} size={48} borderRadius={radii.cover} />
      <View style={styles.editText}>
        <Text variant="callout" numberOfLines={1} style={styles.editTitle}>{song.title}</Text>
        <Text variant="footnote" color="textSecondary" numberOfLines={1}>{song.artist}</Text>
      </View>
      <Pressable onPressIn={drag} hitSlop={12} style={styles.dragHandle} accessibilityLabel={getT().playlistDetail.editTitle}>
        <DragHandleIcon size={20} />
      </Pressable>
    </View>
  );
});

const editKey = (item: EditItem) => item.key;

// ─── Screen ───────────────────────────────────────────────────────────────────

type Row = {s: SubsonicSong; origIdx: number};

export default function PlaylistDetailScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams, 'PlaylistDetail'>>();
  const {playlistId, autoEdit} = useRoute<RouteProp<LibraryStackParams, 'PlaylistDetail'>>().params;

  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [coverArtId, setCoverArtId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recos, setRecos] = useState<DeezerTrack[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const recoFetched = useRef(false);
  const [query, setQuery] = useState('');
  /** Bumped when the cover chosen on the device may have changed. */
  const [coverVersion, setCoverVersion] = useState(0);

  const [editing, setEditing] = useState(false);
  const [editSongs, setEditSongs] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [menuSong, setMenuSong] = useState<{song: SubsonicSong; index: number} | null>(null);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoView, setInfoView] = useState<'info' | 'cover'>('info');
  const [addAllVisible, setAddAllVisible] = useState(false);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);

  const {state} = usePlaybackState();
  const isPlaying = state === State.Playing;
  const currentPlaylistId = usePlayerStore(s => s.currentPlaylistId);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const pinnedIds = useSettingsStore(s => s.pinnedLibraryIds);
  const togglePinned = useSettingsStore(s => s.togglePinnedLibraryId);
  const username = useSettingsStore(s => s.servers.find(srv => srv.id === s.activeServerId)?.username ?? '');
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);

  const isThisPlaylist = currentPlaylistId === playlistId;

  // Track the playing entry by queue index (the same song may appear twice), by id under shuffle.
  const active = useActiveTrack();
  const activeId = active?.id ? String(active.id) : null;
  const [queueIndex, setQueueIndex] = useState<number | undefined>(undefined);
  useEffect(() => {
    TrackPlayer.getActiveTrackIndex().then(setQueueIndex).catch(() => {});
  }, [activeId]);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    if (isOfflineMode) {
      const cache = usePlaylistCacheStore.getState();
      const cached = cache.cachedPlaylists.find(p => p.id === playlistId);
      const {isDownloaded} = useDownloadStore.getState();
      setName(cached?.name ?? '');
      setOwner(cached?.owner ?? username);
      setCoverArtId(cached?.coverArt);
      setSongs(cache.getOfflineSongs(playlistId).filter(s => isDownloaded(String(s.id))));
      setLoading(false);
      return;
    }
    getPlaylist(playlistId)
      .then(({playlist, songs: s}) => {
        setName(playlist.name);
        setOwner(playlist.owner ?? username);
        setDescription(playlist.comment ?? '');
        setCoverArtId(playlist.coverArt);
        setSongs(s);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [playlistId, isOfflineMode, username]);

  useEffect(load, [load]);

  // Online recommendations: top tracks of the playlist's first artists.
  useEffect(() => {
    if (isOfflineMode || songs.length === 0 || recoFetched.current) return;
    recoFetched.current = true;
    const artists = [...new Set(songs.map(s => s.artist).filter(Boolean))].slice(0, 3);
    if (!artists.length) return;
    let cancelled = false;
    setRecoLoading(true);
    (async () => {
      try {
        const ids = await Promise.all(artists.map(n => getDeezerArtistId(n).catch(() => null)));
        const lists = await Promise.all(ids.map(id => (id ? getDeezerArtistTopTracks(id, 15).catch(() => []) : Promise.resolve([]))));
        const enriched = await enrichTracksWithAlbumType(dedupeById(lists.flat()).slice(0, 30));
        if (!cancelled) setRecos(enriched.slice(0, 30));
      } catch {
        // No recommendations: the section stays hidden.
      } finally {
        if (!cancelled) setRecoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [songs, isOfflineMode]);

  // ─── Playback ─────────────────────────────────────────────────────────────

  const source = useMemo(() => ({type: 'playlist' as const, id: playlistId, name}), [playlistId, name]);

  const play = useCallback(async () => {
    if (isThisPlaylist) {
      togglePlay();
      return;
    }
    if (isOfflineMode && !songs.some(s => useDownloadStore.getState().isDownloaded(String(s.id)))) {
      showToast(getT().playlistDetail.noDownloadedSongs);
      return;
    }
    setStarting(true);
    try {
      // The engine applies shuffle, Magic and offline itself (ADR-009).
      await playbackEngine.playContext({source, tracks: songsToTracks(songs)});
    } finally {
      setStarting(false);
    }
  }, [isThisPlaylist, togglePlay, isOfflineMode, songs, source]);

  const playTrack = useCallback(async (origIdx: number) => {
    const tracks = songsToTracks(songs);
    const tapped = tracks[origIdx];
    if (!tapped) return;
    // A9: tapping the track already playing opens the player, it does not restart.
    const current = await TrackPlayer.getActiveTrack().catch(() => undefined);
    if (current && String(current.id) === tapped.id) {
      usePlayerStore.getState().openFullScreen();
      return;
    }
    await playbackEngine.playContext({source, tracks, startTrackId: tapped.id});
  }, [songs, source]);

  // ─── Rows ─────────────────────────────────────────────────────────────────

  const rows = useMemo<Row[]>(() => {
    const all = songs.map((s, origIdx) => ({s, origIdx}));
    const q = query.trim().toLowerCase();
    if (q.length < 2) return all;
    return all.filter(({s}) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [songs, query]);

  const totalSeconds = useMemo(() => songs.reduce((sum, s) => sum + (s.duration ?? 0), 0), [songs]);
  const downloadable = useMemo(() => songs.filter(s => !String(s.id).startsWith('ext-')), [songs]);
  const allDownloaded = downloadable.length > 0 && downloadable.every(s => !!downloads[String(s.id)]);
  const someDownloaded = downloadable.some(s => !!downloads[String(s.id)]);

  const renderItem = useCallback(({item}: {item: Row}) => {
    const id = String(item.s.id);
    const isCurrent = isThisPlaylist && (shuffleMode !== 'off' ? activeId === id : queueIndex === item.origIdx);
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.s.title}
        subtitle={item.s.artist}
        coverId={item.s.coverArt}
        playback={isCurrent ? (isPlaying ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playTrack(item.origIdx)}
        onLongPress={() => setMenuSong({song: item.s, index: item.origIdx})}
        onToggleLike={() => toggleLike(id, item.s.title, item.s.artist)}
        onAddToPlaylist={() => setAddTo(item.s)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item.s)}
        onAddToQueue={() => addSongToQueue(item.s)}
      />
    );
  }, [isThisPlaylist, shuffleMode, activeId, queueIndex, isPlaying, overrides, likedSongIds, downloads, activeDownloads, playTrack, toggleLike]);

  // ─── Recommendations ──────────────────────────────────────────────────────

  const shownRecos = useMemo(() => {
    const inPlaylist = new Set(songs.map(s => `${s.title}|||${s.artist}`));
    return recos.filter(r => !inPlaylist.has(`${r.title}|||${r.artist.name}`)).slice(0, RECO_COUNT);
  }, [recos, songs]);

  const addReco = useCallback(async (track: DeezerTrack) => {
    const extId = `ext-deezer-song-${track.id}`;
    const d = getT();
    showToast(d.likes.sendingToServer);
    // The server imports an online track once it is streamed; then find its server copy.
    fetch(getStreamUrl(extId), {headers: {Range: 'bytes=0-8192'}}).then(r => r.arrayBuffer()).catch(() => {});
    let found: string | null = null;
    for (let attempt = 0; attempt < 25 && !found; attempt++) {
      await new Promise<void>(r => setTimeout(r, 3000));
      if (attempt === 10) showToast(d.likes.stillImporting);
      try {
        const res = await subsonicGet<any>('search3.view', {query: track.title, songCount: 10, albumCount: 0, artistCount: 0});
        const match = (res.searchResult3?.song ?? []).find((s: any) =>
          !String(s.id).startsWith('ext-') && s.title === track.title && s.artist === track.artist.name);
        if (match) found = String(match.id);
      } catch {
        // Keep polling.
      }
    }
    if (!found) {
      showToast(d.likes.sendError);
      return;
    }
    try {
      await updatePlaylist(playlistId, undefined, [found]);
      const added: SubsonicSong = {id: found, title: track.title, artist: track.artist.name, album: track.album.title, duration: track.duration, coverArt: found};
      setSongs(prev => [...prev, added]);
      showToast(d.addToPlaylist.addedTo(track.title, name));
    } catch {
      showToast(d.addToPlaylist.unavailableTrack);
    }
  }, [playlistId, name]);

  const offlineSuggestions = useMemo<DownloadedTrack[]>(() => {
    if (!isOfflineMode) return [];
    const ids = new Set(songs.map(s => String(s.id)));
    return Object.values(downloads).filter(d => !ids.has(d.trackId)).slice(0, 8);
  }, [isOfflineMode, downloads, songs]);

  const playDownloaded = useCallback((track: DownloadedTrack) => {
    playFromList({type: 'other'}, [{
      id: track.trackId, title: track.title, artist: track.artist, album: track.album,
      duration: track.duration, coverArt: track.coverArt,
      streamUrl: track.localPath, url: track.localPath,
      artwork: track.coverArt ? getCoverArtUrl(track.coverArt, 300) : '',
    }], 0);
  }, []);

  // ─── Downloads ────────────────────────────────────────────────────────────

  const download = useCallback(() => {
    const d = getT();
    Alert.alert(d.library.offlineDownloadTitle, d.library.offlineDownloadMessage(name, songs.length), [
      {text: d.playlistOptions.cancelButton, style: 'cancel'},
      {
        text: d.songOptions.download,
        onPress: () => {
          useDownloadStore.getState().enqueueBatch(songs, () => showToast(getT().library.offlineDownloadComplete(name)));
          showToast(d.songOptions.downloadQueued);
        },
      },
    ]);
  }, [name, songs]);

  const deleteDownloads = useCallback(() => {
    const d = getT();
    const done = downloadable.filter(s => !!downloads[String(s.id)]);
    Alert.alert(d.downloads.deletePlaylistTitle, d.downloads.deletePlaylistMessage(name, done.length), [
      {text: d.downloads.cancelButton, style: 'cancel'},
      {text: d.downloads.deleteConfirm, style: 'destructive', onPress: () => done.forEach(s => useDownloadStore.getState().deleteDownload(String(s.id)))},
    ]);
  }, [downloadable, downloads, name]);

  // ─── Edit ─────────────────────────────────────────────────────────────────

  const startEdit = useCallback(() => {
    setEditSongs(songs.map((song, i) => ({key: `${String(song.id)}-${i}`, song})));
    setEditing(true);
  }, [songs]);

  const autoEditDone = useRef(false);
  useEffect(() => {
    if (autoEdit && !autoEditDone.current && songs.length > 0 && !loading) {
      autoEditDone.current = true;
      startEdit();
    }
  }, [autoEdit, songs, loading, startEdit]);

  const removeFromEdit = useCallback((key: string) => setEditSongs(prev => prev.filter(e => e.key !== key)), []);
  const reorderEdit = useCallback(({from, to}: ReorderableListReorderEvent) => setEditSongs(prev => reorderItems(prev, from, to)), []);
  const renderEditItem = useCallback(({item}: {item: EditItem}) => <EditRow item={item} onRemove={removeFromEdit} />, [removeFromEdit]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      await replacePlaylist(playlistId, editSongs.map(e => String(e.song.id)));
      const {playlist, songs: fresh} = await getPlaylist(playlistId);
      setName(playlist.name);
      setCoverArtId(playlist.coverArt);
      setSongs(fresh);
      setEditing(false);
      setEditSongs([]);
      showToast(getT().playlistDetail.savedToast);
      fetchAndCachePlaylistSongs();
    } catch {
      showToast(getT().playlistDetail.saveError);
    } finally {
      setSaving(false);
    }
  }, [editSongs, playlistId]);

  const reloadAfterRemoval = useCallback(() => {
    setMenuSong(null);
    getPlaylist(playlistId)
      .then(({playlist, songs: s}) => { setName(playlist.name); setCoverArtId(playlist.coverArt); setSongs(s); })
      .catch(() => {});
  }, [playlistId]);

  const openInfo = useCallback((view: 'info' | 'cover') => { setInfoView(view); setInfoVisible(true); }, []);

  // ─── Hero ─────────────────────────────────────────────────────────────────

  const metaLine = (
    <View style={styles.metaRow}>
      {allDownloaded ? <Badge kind="downloaded" size="small" /> : null}
      <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.meta}>
        {[owner ? t.playlistDetail.byOwner(owner) : '', t.playlistDetail.trackCount(songs.length), totalSeconds > 0 ? lengthLabel(totalSeconds) : '']
          .filter(Boolean).join(' · ')}
      </Text>
    </View>
  );

  const playRow = (
    <PlayShuffleRow
      onPlay={play}
      onShuffle={toggleShuffle}
      shuffleMode={shuffleMode}
      loading={starting}
      disabled={!songs.length}
      playing={isThisPlaylist && isPlaying}
      extra={isOfflineMode ? null : (
        <SquareButton icon={<PencilIcon size={18} color={colors.textPrimary} strokeWidth={2} />} onPress={startEdit} accessibilityLabel={t.playlistDetail.edit} />
      )}
    />
  );

  const cover = (size: number, radius: number, side = false) => (
    <Raised radius={radius} style={side ? styles.sideCover : undefined}>
      <CoverArt key={coverVersion} id={coverArtId} playlistId={playlistId} size={size} borderRadius={radius} />
    </Raised>
  );

  const search = songs.length > 6 ? (
    <View style={styles.search}>
      <SearchField value={query} onChangeText={setQuery} placeholder={t.playlistDetail.searchInPlaylist} />
    </View>
  ) : null;

  const hero = !loading && !failed ? (
    <View>
      <View style={styles.hero}>
        {cover(COVER, radii.button)}
        <Text variant="title2" numberOfLines={2} style={styles.title}>{name}</Text>
        {metaLine}
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
      {search}
    </View>
  ) : null;

  const side = !loading && !failed ? (
    <View>
      {cover(SIDE_COVER, radii.tile, true)}
      <Text variant="title3" numberOfLines={2} style={styles.sideTitle}>{name}</Text>
      <View style={styles.sideMeta}>{metaLine}</View>
      <View style={styles.sidePlay}>{playRow}</View>
    </View>
  ) : null;

  const footer = isOfflineMode ? (
    offlineSuggestions.length ? (
      <View style={styles.section}>
        <View style={styles.sectionHeader}><SectionHeader title={t.playlistDetail.offlineRecoLabel} /></View>
        {offlineSuggestions.map(d => (
          <TrackRow key={d.trackId} title={d.title} subtitle={d.artist} coverId={d.coverArt} download="done" hideActions onPress={() => playDownloaded(d)} />
        ))}
      </View>
    ) : null
  ) : shownRecos.length || recoLoading ? (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader title={t.playlistDetail.recommendations.title} subtitle={t.playlistDetail.recommendations.subtitle} />
      </View>
      {recoLoading && !shownRecos.length ? <ActivityIndicator color={colors.accent} style={styles.recoLoading} /> : null}
      {shownRecos.map(r => (
        <RecoRow key={r.id} track={r} onPress={() => playFromList({type: 'other'}, [deezerToTrack(r)], 0)} onAdd={() => addReco(r)} />
      ))}
    </View>
  ) : null;

  const empty = failed
    ? <EmptyState title={t.playlistDetail.loadError} action={{label: t.common.retry, onPress: load}} />
    : query.trim().length >= 2
      ? <EmptyState title={t.playlistDetail.searchEmpty} />
      : <EmptyState title={t.playlistDetail.empty.title} message={t.playlistDetail.empty.message} />;

  const sheets = (
    <>
      <SongOptionsSheet
        visible={!!menuSong}
        onClose={() => setMenuSong(null)}
        track={menuSong?.song ?? null}
        playlistId={playlistId}
        trackIndex={menuSong?.index ?? 0}
        onToast={showToast}
        onRemoved={reloadAfterRemoval}
        onNavigateAlbum={albumId => navigation.navigate('AlbumDetail', {albumId})}
        onNavigateArtist={(artistId, artistName) => navigation.navigate('ArtistDetail', artistId ? {artistId} : {artistName})}
      />
      <PlaylistOptionsSheet
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        playlist={name ? {id: playlistId, name, coverArt: coverArtId, songCount: songs.length} : null}
        isPinned={pinnedIds.includes(playlistId)}
        onTogglePin={() => togglePinned(playlistId)}
        onToast={showToast}
        onDeleted={() => navigation.goBack()}
        onStartEdit={startEdit}
        onOpenInfo={() => openInfo('info')}
        onOpenCover={() => openInfo('cover')}
        onAddAll={() => setAddAllVisible(true)}
        onDownload={isOfflineMode ? undefined : download}
        onDeleteDownloads={someDownloaded ? deleteDownloads : undefined}
      />
      <AddToPlaylistSheet visible={addAllVisible} onClose={() => setAddAllVisible(false)} trackIds={songs.map(s => String(s.id))} onToast={showToast} />
      <AddToPlaylistSheet
        visible={!!addTo}
        onClose={() => setAddTo(null)}
        trackId={addTo ? String(addTo.id) : undefined}
        trackTitle={addTo?.title}
        onToast={showToast}
      />
      <PlaylistInfoModal
        visible={infoVisible}
        onClose={() => { setInfoVisible(false); setCoverVersion(v => v + 1); }}
        playlistId={playlistId}
        initialName={name}
        initialDescription={description}
        coverArtId={coverArtId}
        onSaved={(newName, desc) => { setName(newName); setDescription(desc); showToast(getT().playlistInfo.saved); }}
        onDeleted={() => navigation.goBack()}
        initialView={infoView}
      />
    </>
  );

  if (editing) {
    return (
      <View style={[styles.root, landscapePadding]}>
        <ReorderableList
          data={editSongs}
          keyExtractor={editKey}
          renderItem={renderEditItem}
          onReorder={reorderEdit}
          shouldUpdateActiveItem
          ListHeaderComponent={<Text variant="footnote" color="textSecondary" style={styles.editHint}>{t.playlistDetail.editHint}</Text>}
          contentContainerStyle={{paddingTop: insets.top + 64, paddingBottom: dockInset + spacing.m}}
          showsVerticalScrollIndicator={false}
        />
        <View style={[styles.editBarWrap, {top: insets.top + 6}]}>
          <GlassSurface style={styles.editBar}>
            <Pressable onPress={() => { setEditing(false); setEditSongs([]); }} hitSlop={6} style={styles.editSide} accessibilityRole="button">
              <Text variant="body" style={styles.editCancel}>{t.playlistDetail.cancel}</Text>
            </Pressable>
            <Text variant="headline">{t.playlistDetail.editTitle}</Text>
            <PressableScale onPress={saveEdit} disabled={saving} accessibilityLabel={t.playlistDetail.saveButton} style={styles.editSave}>
              {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text variant="subhead" style={styles.editSaveText}>{t.playlistDetail.saveButton}</Text>}
            </PressableScale>
          </GlassSurface>
        </View>
        {sheets}
      </View>
    );
  }

  return (
    <>
      <DetailScaffold
        title={name}
        coverId={coverArtId}
        topRight={!loading && !failed ? (
          <GlassButton icon={<DotsHorizontalIcon size={20} color={colors.textPrimary} />} onPress={() => setOptionsVisible(true)} accessibilityLabel={t.playlistDetail.options} />
        ) : null}
        hero={hero}
        side={side}
        showTitleAt={COVER + 36}
        data={loading ? [] : rows}
        renderItem={renderItem}
        keyExtractor={r => `${String(r.s.id)}-${r.origIdx}`}
        footer={footer}
        loading={loading}
        empty={empty}
      />
      {sheets}
    </>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  hero: {alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.s},
  title: {textAlign: 'center', marginTop: 18},
  metaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4},
  meta: {flexShrink: 1},
  playSpacing: {paddingTop: 18, paddingBottom: 12},
  search: {paddingHorizontal: spacing.gutter, paddingBottom: 6},
  sideCover: {alignSelf: 'flex-start'},
  sideTitle: {fontWeight: '700', marginTop: 12},
  sideMeta: {alignItems: 'flex-start'},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
  section: {marginTop: 26},
  sectionHeader: {paddingHorizontal: spacing.gutter, paddingBottom: 6},
  recoLoading: {marginVertical: 16},
  reco: {height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.gutter},
  recoText: {flex: 1, minWidth: 0, gap: 1},
  recoTitle: {fontWeight: '500'},
  recoMeta: {flexDirection: 'row', alignItems: 'center', gap: 5},
  recoArtist: {flexShrink: 1},
  recoAdd: {width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center'},
  editHint: {paddingHorizontal: spacing.gutter, paddingBottom: 10},
  editRow: {height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: spacing.gutter, paddingRight: spacing.s, backgroundColor: colors.background},
  editRowActive: {backgroundColor: colors.surface1},
  editText: {flex: 1, minWidth: 0, gap: 1},
  editTitle: {fontWeight: '500'},
  dragHandle: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  editBarWrap: {position: 'absolute', left: spacing.m, right: spacing.m},
  editBar: {height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4},
  editSide: {height: 36, paddingHorizontal: 14, justifyContent: 'center'},
  editCancel: {color: 'rgba(235,235,245,0.85)'},
  editSave: {height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.accent, justifyContent: 'center'},
  editSaveText: {color: colors.onAccent, fontWeight: '600'},
});
