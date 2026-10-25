/**
 * @file index.tsx
 * @description "My Music" screen (Design v2, R5.7) — the user's whole native
 *   Navidrome library (Deezer `ext-` tracks left out). My Music cover, title,
 *   "N songs · length"; Play and Shuffle; a search field; the sort (title,
 *   artist, recently added) and, in the alphabetical orders, a letter header
 *   before each section and a sheet to jump to a letter. Built on the shared
 *   detail layout, songs on the shared `TrackRow`.
 *   The full library is fetched once via paginated empty-query search3 calls
 *   (no single Subsonic "get everything" endpoint exists), then filtered
 *   client-side by the search field. The last list is kept on the device
 *   (read only when the screen opens, not at launch) so the songs show at
 *   once, then the server's answer replaces it. Playback goes through the playback
 *   engine (playFromList). Offline (or when the server cannot be reached),
 *   lists the downloaded tracks: the only ones that can play.
 * @author DoodzProg
 * @version 2.2.2
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {DETAIL_BAR_HEIGHT, PlayShuffleRow} from '../../components/detail/DetailParts';
import {usePlayButton} from '../../hooks/usePlayButton';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import PressableScale from '../../components/ui/PressableScale';
import Sheet from '../../components/ui/Sheet';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import {AllSongsCover, ALL_SONGS_COVER_COLORS} from '../../components/ui/SpecialCovers';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {CheckIcon, SortIcon} from '../../components/icons';
import {subsonicGet} from '../../api/client';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore, type AllSongsSortMode} from '../../store/settingsStore';
import {useDownloadStore} from '../../store/downloadStore';
import {storage} from '../../store/storage';
import {downloadedSongs} from '../../utils/offlineSongs';
import {songToTrack} from '../../utils/songToTrack';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';
import {buildRows, headerIndex, sortSongs, INDEX_LETTERS, type Row} from './allSongsModel';

const FULL_LIBRARY_PAGE_SIZE = 500;
const FULL_LIBRARY_MAX_PAGES = 10;
const COVER = 200;
const SIDE_COVER = 128;
/** Heights of the list rows: the list knows every offset (1,700+ rows, jumps to a letter). */
const SONG_HEIGHT = 64;
const HEADER_HEIGHT = 36;
const SORTS: AllSongsSortMode[] = ['az', 'artist', 'recent'];
const rowHeight = (row: Row) => (row.kind === 'header' ? HEADER_HEIGHT : SONG_HEIGHT);

function lengthLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/**
 * Enumerates every native track on the server via paginated empty-query
 * search3 calls — there is no single Subsonic "get everything" endpoint.
 */
async function fetchAllNativeSongs(): Promise<SubsonicSong[]> {
  const all: SubsonicSong[] = [];
  for (let page = 0; page < FULL_LIBRARY_MAX_PAGES; page++) {
    const res = await subsonicGet<any>('search3.view', {
      query: '',
      songCount: FULL_LIBRARY_PAGE_SIZE,
      songOffset: page * FULL_LIBRARY_PAGE_SIZE,
      albumCount: 0,
      artistCount: 0,
    });
    const batch: SubsonicSong[] = res.searchResult3?.song ?? [];
    all.push(...batch.filter(s => !String(s.id).startsWith('ext-')));
    if (batch.length < FULL_LIBRARY_PAGE_SIZE) break;
  }
  return all;
}

/** Device copy of the last list: only what the rows, sorts and playback use. */
const CACHE_KEY = 'all-songs-cache-v1';

function readCache(): SubsonicSong[] {
  try {
    const raw = storage.getString(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SubsonicSong[]) : [];
  } catch {
    return [];
  }
}

function writeCache(songs: SubsonicSong[]) {
  const slim = songs.map(s => ({
    id: s.id, title: s.title, artist: s.artist, artistId: s.artistId, album: s.album, albumId: s.albumId,
    coverArt: s.coverArt, duration: s.duration, suffix: s.suffix, created: (s as {created?: string}).created,
  }));
  storage.set(CACHE_KEY, JSON.stringify(slim));
}

type RowActions = {
  play: (index: number) => void;
  menu: (song: SubsonicSong) => void;
  like: (song: SubsonicSong) => void;
  add: (song: SubsonicSong) => void;
  download: (song: SubsonicSong) => void;
  queue: (song: SubsonicSong) => void;
};

type SongRowProps = {
  song: SubsonicSong;
  index: number;
  playback: 'idle' | 'current' | 'playing';
  liked: boolean;
  download: 'none' | 'downloading' | 'done';
  actions: RowActions;
};

const SongRow = React.memo(function SongRow({song, index, playback, liked, download, actions}: SongRowProps) {
  return (
    <TrackRow
      title={song.title}
      subtitle={song.artist}
      coverId={song.coverArt}
      playback={playback}
      liked={liked}
      download={download}
      onPress={() => actions.play(index)}
      onLongPress={() => actions.menu(song)}
      onToggleLike={() => actions.like(song)}
      onAddToPlaylist={() => actions.add(song)}
      onDownload={() => actions.download(song)}
      onAddToQueue={() => actions.queue(song)}
    />
  );
});

export default function AllSongsScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const isLandscape = useIsLandscape();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const sort = useSettingsStore(s => s.allSongsSortMode);
  const setSort = useSettingsStore(s => s.setAllSongsSortMode);
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);
  const active = useActiveTrack();
  const {state} = usePlaybackState();

  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Server unreachable, no saved list and nothing downloaded; `attempt` reloads.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(a => a + 1);
  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);
  const [sortVisible, setSortVisible] = useState(false);
  const [jumpVisible, setJumpVisible] = useState(false);
  const listRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let cancelled = false;
    // Only downloaded tracks can play offline: list them.
    const offlineList = () => downloadedSongs(useDownloadStore.getState().downloads);
    setFailed(false);
    if (isOfflineMode) {
      setSongs(offlineList());
      setLoading(false);
      return;
    }
    // Last list at once (no skeleton when there is one), then the server's.
    const cached = readCache();
    setSongs(cached);
    setLoading(cached.length === 0);
    fetchAllNativeSongs()
      .then(result => {
        if (cancelled) return;
        setSongs(result);
        writeCache(result);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep the saved list when there is one: it is more complete than the downloads.
        const list = cached.length ? cached : offlineList();
        setSongs(list);
        setFailed(list.length === 0);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOfflineMode, attempt]);

  const searching = query.trim().length > 0;
  const sorted = useMemo(() => sortSongs(songs, sort), [songs, sort]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q));
  }, [sorted, query]);
  const rows = useMemo(() => buildRows(shown, sort, !searching), [shown, sort, searching]);
  const tracks = useMemo(() => shown.map(songToTrack), [shown]);
  const totalSeconds = useMemo(() => songs.reduce((sum, s) => sum + (s.duration || 0), 0), [songs]);
  const withHeaders = !searching && sort !== 'recent' && shown.length > 0;

  const jumpTo = useCallback((letter: string) => {
    setJumpVisible(false);
    const index = headerIndex(rows, letter);
    if (index === undefined) return;
    // The header lands just under the top bar (portrait) or the status bar (landscape).
    // FlashList adds viewOffset to the row's offset: negative to stop above it.
    const viewOffset = -(insets.top + (isLandscape ? 0 : DETAIL_BAR_HEIGHT));
    listRef.current?.scrollToIndex({index, viewOffset, animated: false});
  }, [rows, insets.top, isLandscape]);

  const playAll = useCallback(() => { if (tracks.length) playFromList({type: 'library'}, tracks); }, [tracks]);
  const playButton = usePlayButton({type: 'library'}, playAll);

  // Same handlers for every row and every render: a row redraws only when its own song,
  // playback, like or download state changes, not the ~200 mounted rows at each play / pause.
  const latest = useRef({tracks, toggleLike});
  latest.current = {tracks, toggleLike};
  const rowActions = useMemo<RowActions>(() => ({
    play: index => playFromList({type: 'library'}, latest.current.tracks, index),
    menu: setMenuSong,
    like: song => latest.current.toggleLike(String(song.id), song.title, song.artist),
    add: setAddTo,
    download: song => useDownloadStore.getState().enqueueTrack(song),
    queue: addSongToQueue,
  }), []);

  const renderItem = useCallback(({item}: {item: Row}) => {
    if (item.kind === 'header') {
      return (
        <Pressable
          onPress={() => setJumpVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`${item.letter}, ${t.allSongs.jumpTitle}`}
          style={styles.header}>
          <Text variant="headline" color="textSecondary">{item.letter}</Text>
        </Pressable>
      );
    }
    const song = item.song;
    const id = String(song.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <SongRow
        song={song}
        index={item.index}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        actions={rowActions}
      />
    );
  }, [t, active?.id, state, overrides, likedSongIds, downloads, activeDownloads, rowActions]);

  const meta = loading ? '…' : [t.allSongs.trackCount(songs.length), totalSeconds > 0 ? lengthLabel(totalSeconds) : ''].filter(Boolean).join(' · ');

  const playRow = (
    <PlayShuffleRow onPlay={playButton.onPlay} playing={playButton.playing} onShuffle={toggleShuffle} shuffleMode={shuffleMode} disabled={!tracks.length} />
  );

  const sortRow = songs.length > 0 ? (
    <View style={styles.sortRow}>
      <PressableScale onPress={() => setSortVisible(true)} hitSlop={10} accessibilityLabel={`${t.library.sortTitle}, ${t.allSongs.sort[sort]}`} style={styles.sortBtn}>
        <SortIcon size={14} color={colors.textSecondary} />
        <Text variant="footnote" color="textSecondary" style={styles.sortLabel}>{t.allSongs.sort[sort]}</Text>
      </PressableScale>
      {withHeaders ? (
        <PressableScale onPress={() => setJumpVisible(true)} hitSlop={10} accessibilityLabel={t.allSongs.jumpTitle}>
          <Text variant="footnote" color="accent" style={styles.sortLabel}>A–Z</Text>
        </PressableScale>
      ) : null}
    </View>
  ) : null;

  const hero = (
    <View>
      <View style={styles.hero}>
        <Raised radius={radii.button}><AllSongsCover size={COVER} borderRadius={radii.button} /></Raised>
        <Text variant="title2" style={styles.title}>{t.allSongs.title}</Text>
        <Text variant="footnote" color="textSecondary">{meta}</Text>
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
      {songs.length > 6 ? (
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder={t.allSongs.searchPlaceholder} />
        </View>
      ) : null}
      {sortRow}
    </View>
  );

  const side = (
    <View>
      <Raised radius={radii.tile} style={styles.sideCover}><AllSongsCover size={SIDE_COVER} borderRadius={radii.tile} /></Raised>
      <Text variant="title3" style={styles.sideTitle}>{t.allSongs.title}</Text>
      <Text variant="footnote" color="textSecondary">{meta}</Text>
      <View style={styles.sidePlay}>{playRow}</View>
      {songs.length > 6 ? (
        <View style={styles.sideSearch}>
          <SearchField value={query} onChangeText={setQuery} placeholder={t.allSongs.searchPlaceholder} />
        </View>
      ) : null}
      <View style={styles.sideSort}>{sortRow}</View>
    </View>
  );

  const present = useMemo(() => new Set(rows.flatMap(r => (r.kind === 'header' ? [r.letter] : []))), [rows]);

  return (
    <>
      <DetailScaffold
        title={t.allSongs.title}
        tint={ALL_SONGS_COVER_COLORS[0]}
        hero={hero}
        side={side}
        showTitleAt={COVER + 36}
        data={rows}
        renderItem={renderItem}
        keyExtractor={r => r.key}
        loading={loading}
        empty={failed ? <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} action={{label: t.common.retry, onPress: retry}} /> : <EmptyState title={searching ? t.allSongs.searchEmpty : t.library.emptyState} />}
        listRef={listRef}
        itemHeight={rowHeight}
      />
      <Sheet visible={sortVisible} onClose={() => setSortVisible(false)} title={t.library.sortTitle}>
        <View style={styles.sheetBody}>
          <ListGroup raised>
            {SORTS.map(m => (
              <ListItem
                key={m}
                label={t.allSongs.sort[m]}
                accessory={sort === m ? <CheckIcon size={20} color={colors.accent} strokeWidth={2.5} /> : undefined}
                onPress={() => { setSort(m); setSortVisible(false); }}
              />
            ))}
          </ListGroup>
        </View>
      </Sheet>
      <Sheet visible={jumpVisible} onClose={() => setJumpVisible(false)} title={t.allSongs.jumpTitle}>
        <View style={styles.letters}>
          {INDEX_LETTERS.map(letter => {
            const on = present.has(letter);
            return (
              <PressableScale
                key={letter}
                onPress={() => jumpTo(letter)}
                disabled={!on}
                haptic="selection"
                accessibilityLabel={letter}
                accessibilityState={{disabled: !on}}
                style={[styles.letter, !on && styles.letterOff]}>
                <Text variant="headline" color={on ? 'textPrimary' : 'textSecondary'}>{letter}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Sheet>
      <AddToPlaylistSheet
        visible={!!addTo}
        onClose={() => setAddTo(null)}
        trackId={addTo ? String(addTo.id) : undefined}
        trackTitle={addTo?.title}
        onToast={showToast}
      />
      <SongOptionsSheet
        visible={!!menuSong}
        onClose={() => setMenuSong(null)}
        track={menuSong}
        onToast={showToast}
        onNavigateAlbum={albumId => navigation.navigate('AlbumDetail', {albumId})}
        onNavigateArtist={(artistId, artistName) => navigation.navigate('ArtistDetail', {artistId, artistName})}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: {alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.s, gap: 2},
  title: {marginTop: 16},
  playSpacing: {paddingTop: 18, paddingBottom: 12},
  search: {paddingHorizontal: spacing.gutter, paddingBottom: 6},
  sortRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.gutter, paddingTop: 6, paddingBottom: 6},
  sortBtn: {flexDirection: 'row', alignItems: 'center', gap: 6},
  sortLabel: {fontWeight: '600'},
  header: {height: HEADER_HEIGHT, justifyContent: 'flex-end', paddingHorizontal: spacing.gutter, paddingBottom: 4},
  sideCover: {alignSelf: 'flex-start'},
  sideTitle: {fontWeight: '700', marginTop: 12},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
  sideSearch: {marginTop: 12},
  sideSort: {marginTop: 6, marginHorizontal: -spacing.gutter},
  sheetBody: {paddingHorizontal: spacing.m, paddingBottom: spacing.m},
  letters: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.m, paddingBottom: spacing.l},
  letter: {width: 48, height: 48, borderRadius: radii.tile, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center'},
  letterOff: {opacity: 0.35},
});
