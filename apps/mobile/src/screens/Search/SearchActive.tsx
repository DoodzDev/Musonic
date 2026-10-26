/**
 * @file SearchActive.tsx
 * @description Live search screen (Design v2, R5.2). Search field with
 *   Cancel, a segmented control (All, My library, Online), then the best
 *   result, the artists and albums as shelves and the songs on the shared
 *   `TrackRow` (like, add to a playlist, download, long press = track menu).
 *   With an empty field, the recent searches. Subsonic results are immediate;
 *   Deezer artist images are enriched asynchronously using a generation
 *   counter to prevent race conditions. Tapped results play alone, then
 *   autoplay (playback engine, ADR-009 A8).
 * @author DoodzProg
 * @version 2.1.1
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FlatList, Pressable, StatusBar, StyleSheet, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from '../../services/player';
import Text from '../../components/ui/Text';
import SearchField from '../../components/ui/SearchField';
import SegmentedControl from '../../components/ui/SegmentedControl';
import TrackRow from '../../components/ui/TrackRow';
import CollectionRow from '../../components/ui/CollectionRow';
import ArtistAvatar from '../../components/ui/ArtistAvatar';
import Cover from '../../components/ui/Cover';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import {SkeletonList} from '../../components/ui/Skeleton';
import SectionHeader from '../../components/ui/SectionHeader';
import {AlbumCard, ArtistBubble, HomeShelf} from '../../components/home/HomeCards';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {ClockIcon} from '../../components/icons';
import {search, getDeezerArtistImageCached} from '../../api/endpoints/search';
import {getStreamUrl, getCoverArtUrl} from '../../api/client';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {usePlayerStore} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useSearchHistoryStore, type HistoryItem} from '../../store/searchHistoryStore';
import {songToTrack} from '../../utils/songToTrack';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';
import {bestResult, filterScope, isOnline, withoutBest, type BestResult, type SearchResults, type SearchScope} from './searchModel';

const EMPTY: SearchResults = {artists: [], albums: [], songs: []};
const BEST_IMAGE = 88;

export default function SearchActive() {
  const t = useT();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const inputRef = useRef<TextInput>(null);

  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);
  const active = useActiveTrack();
  const {state} = usePlaybackState();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [artistImages, setArtistImages] = useState<Map<string, string>>(new Map());
  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);
  const genRef = useRef(0);
  // Search request failed (not the same as no results); `attempt` re-runs it.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt(a => a + 1);

  const history = useSearchHistoryStore(s => s.history);
  const addItem = useSearchHistoryStore(s => s.addItem);
  const clearHistory = useSearchHistoryStore(s => s.clearHistory);

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    genRef.current += 1;
    const myGen = genRef.current;
    if (!query.trim()) {
      setResults(EMPTY);
      setArtistImages(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const debounce = setTimeout(async () => {
      try {
        const data = await search(query);
        if (genRef.current !== myGen) return;
        setResults({artists: data.artists, albums: data.albums, songs: data.songs});
        setArtistImages(new Map());
        setLoading(false);
        // Deezer photos for the artists without one on the server.
        for (const artist of data.artists.filter(a => !a.artistImageUrl)) {
          const url = await getDeezerArtistImageCached(artist.name);
          if (genRef.current !== myGen) break;
          if (url) setArtistImages(prev => new Map(prev).set(artist.id, url));
        }
      } catch {
        if (genRef.current !== myGen) return;
        setResults(EMPTY);
        setFailed(true);
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounce);
  }, [query, attempt]);

  const scoped = useMemo(() => filterScope(results, scope), [results, scope]);
  const best = useMemo(() => bestResult(scoped, query), [scoped, query]);
  const rest = useMemo(() => withoutBest(scoped, best), [scoped, best]);
  const tracks = useMemo(() => rest.songs.map(songToTrack), [rest.songs]);

  const imageOf = useCallback(
    (a: {id: string; artistImageUrl?: string}) => a.artistImageUrl ?? artistImages.get(a.id),
    [artistImages],
  );

  const openArtist = useCallback((id: string, name: string, imageUrl?: string) => {
    addItem({type: 'artist', id, name, imageUrl});
    navigation.push('ArtistDetail', {artistId: id, artistName: name});
  }, [addItem, navigation]);

  const openAlbum = useCallback((id: string, name: string, artist: string) => {
    addItem({type: 'album', id, name, artist});
    navigation.push('AlbumDetail', {albumId: id});
  }, [addItem, navigation]);

  const rememberSong = useCallback((song: SubsonicSong) => {
    addItem({type: 'song', id: String(song.id), title: song.title, artist: song.artist, duration: song.duration, coverArt: song.coverArt});
  }, [addItem]);

  const selectHistory = useCallback((item: HistoryItem) => {
    switch (item.type) {
      case 'text':
        addItem(item);
        setQuery(item.query);
        inputRef.current?.blur();
        break;
      case 'artist':
        openArtist(item.id, item.name, item.imageUrl);
        break;
      case 'album':
        openAlbum(item.id, item.name, item.artist);
        break;
      case 'song':
        addItem(item);
        playFromList({type: 'search'}, [{
          id: item.id,
          title: item.title,
          artist: item.artist,
          album: '',
          duration: item.duration ?? 0,
          coverArt: item.coverArt,
          streamUrl: getStreamUrl(item.id),
          url: getStreamUrl(item.id),
          artwork: getCoverArtUrl(item.coverArt || item.id, 300),
        }], 0);
        break;
    }
  }, [addItem, openArtist, openAlbum]);

  const submit = useCallback(() => {
    const q = query.trim();
    if (q) addItem({type: 'text', query: q});
  }, [query, addItem]);

  const renderSong = useCallback(({item, index}: {item: SubsonicSong; index: number}) => {
    const id = String(item.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.title}
        subtitle={item.artist}
        coverId={item.coverArt}
        badges={isOnline(id) ? ['online'] : undefined}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => {
          rememberSong(item);
          // A8: a search result plays alone, autoplay follows.
          playFromList({type: 'search'}, tracks, index);
        }}
        onLongPress={() => setMenuSong(item)}
        onToggleLike={() => toggleLike(id, item.title, item.artist)}
        onAddToPlaylist={() => setAddTo(item)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item)}
        onAddToQueue={() => addSongToQueue(item)}
      />
    );
  }, [active?.id, state, overrides, likedSongIds, downloads, activeDownloads, tracks, toggleLike, rememberSong]);

  const bestCard = best ? (
    <BestCard
      best={best}
      imageUrl={best.type === 'artist' ? imageOf(best.artist) : undefined}
      onPress={() => {
        if (best.type === 'artist') openArtist(best.artist.id, best.artist.name, imageOf(best.artist));
        else if (best.type === 'album') openAlbum(best.album.id, best.album.name, best.album.artist);
        else {
          rememberSong(best.song);
          playFromList({type: 'search'}, [songToTrack(best.song)], 0);
        }
      }}
      onLongPress={best.type === 'song' ? () => setMenuSong(best.song) : undefined}
    />
  ) : null;

  const resultsHeader = (
    <View>
      {bestCard ? (
        <View style={styles.bestBlock}>
          <View style={styles.sectionTitle}><SectionHeader title={t.search.bestResult} /></View>
          {bestCard}
        </View>
      ) : null}
      <HomeShelf
        title={t.search.sections.artists}
        data={rest.artists}
        keyOf={a => `ar-${a.id}`}
        gap={16}
        renderItem={a => (
          <ArtistBubble name={a.name} coverId={a.coverArt} imageUrl={imageOf(a)} onPress={() => openArtist(a.id, a.name, imageOf(a))} />
        )}
      />
      <HomeShelf
        title={t.search.sections.albums}
        data={rest.albums}
        keyOf={a => `al-${a.id}`}
        renderItem={a => (
          <AlbumCard
            name={a.name}
            subtitle={a.artist}
            coverId={a.coverArt}
            onPress={() => openAlbum(a.id, a.name, a.artist)}
          />
        )}
      />
      {rest.songs.length > 0 ? <View style={styles.sectionTitle}><SectionHeader title={t.search.sections.songs} /></View> : null}
    </View>
  );

  const typing = query.trim().length > 0;
  const nothing = !loading && typing && !best;

  const historyList = history.length > 0 ? (
    <View>
      <View style={styles.historyHeader}>
        <Text variant="headline">{t.search.history.title}</Text>
        <Pressable onPress={clearHistory} hitSlop={10} accessibilityRole="button">
          <Text variant="subhead" style={styles.clear}>{t.search.history.clear}</Text>
        </Pressable>
      </View>
      {history.map((item, i) => (
        <HistoryRow key={`${item.type}-${i}`} item={item} onPress={() => selectHistory(item)} />
      ))}
    </View>
  ) : null;

  return (
    <View style={[styles.root, landscapePadding, {paddingTop: insets.top}]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={isFullscreenMode} />

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <SearchField
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder={t.search.placeholder}
            onSubmitEditing={submit}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button">
          <Text variant="body" style={styles.cancel}>{t.library.searchCancel}</Text>
        </Pressable>
      </View>

      {typing ? (
        <View style={styles.segment}>
          <SegmentedControl
            options={[
              {value: 'all', label: t.search.scope.all},
              {value: 'library', label: t.search.scope.library},
              {value: 'online', label: t.search.scope.online},
            ]}
            value={scope}
            onChange={setScope}
          />
        </View>
      ) : null}

      {!typing ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={historyList}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{paddingBottom: dockInset + spacing.m}}
        />
      ) : loading ? (
        <SkeletonList />
      ) : failed ? (
        <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} action={{label: t.common.retry, onPress: retry}} />
      ) : nothing ? (
        <EmptyState title={t.search.noResults(query.trim())} />
      ) : (
        <FlatList
          data={rest.songs}
          renderItem={renderSong}
          keyExtractor={s => String(s.id)}
          ListHeaderComponent={resultsHeader}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom: dockInset + spacing.m}}
        />
      )}

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
        onNavigateAlbum={albumId => {
          setMenuSong(null);
          navigation.push('AlbumDetail', {albumId});
        }}
        onNavigateArtist={(artistId, artistName) => {
          setMenuSong(null);
          navigation.push('ArtistDetail', {artistId, artistName});
        }}
      />
    </View>
  );
}

/** The best result: a large row on a card, with its type. */
function BestCard({best, imageUrl, onPress, onLongPress}: {
  best: BestResult;
  imageUrl?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useT();
  const name = best.type === 'artist' ? best.artist.name : best.type === 'album' ? best.album.name : best.song.title;
  const id = best.type === 'artist' ? best.artist.id : best.type === 'album' ? best.album.id : String(best.song.id);
  const subtitle = best.type === 'artist'
    ? t.search.artistType
    : best.type === 'album'
      ? `${t.search.albumType} · ${best.album.artist}`
      : `${t.search.trackType} · ${best.song.artist}`;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{color: colors.fill}}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${subtitle}`}
      style={styles.best}>
      {best.type === 'artist' ? (
        <ArtistAvatar name={name} id={best.artist.coverArt} imageUrl={imageUrl} size={BEST_IMAGE} />
      ) : (
        <Cover id={best.type === 'album' ? best.album.coverArt : best.song.coverArt} size="tile" />
      )}
      <View style={styles.bestText}>
        <Text variant="title3" numberOfLines={2} style={styles.bestName}>{name}</Text>
        <View style={styles.bestMeta}>
          {isOnline(id) ? <Badge kind="online" size="small" /> : null}
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.shrink}>{subtitle}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A recent search: a past query (clock) or an artist, album or song. */
function HistoryRow({item, onPress}: {item: HistoryItem; onPress: () => void}) {
  const t = useT();
  if (item.type === 'text') {
    return (
      <Pressable onPress={onPress} android_ripple={{color: colors.fill}} accessibilityRole="button" accessibilityLabel={item.query} style={styles.textRow}>
        <View style={styles.clock}><ClockIcon size={18} color={colors.textSecondary} /></View>
        <Text variant="callout" numberOfLines={1} style={styles.shrink}>{item.query}</Text>
      </Pressable>
    );
  }
  if (item.type === 'artist') {
    return <CollectionRow kind="artist" name={item.name} subtitle={t.search.artistType} coverUrl={item.imageUrl} onPress={onPress} />;
  }
  if (item.type === 'album') {
    return <CollectionRow kind="album" name={item.name} subtitle={`${t.search.albumType} · ${item.artist}`} coverId={item.id} onPress={onPress} />;
  }
  return <CollectionRow kind="album" name={item.title} subtitle={`${t.search.trackType} · ${item.artist}`} coverId={item.coverArt || item.id} onPress={onPress} />;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  searchRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.gutter, paddingTop: spacing.s, paddingBottom: 12},
  searchField: {flex: 1},
  cancel: {color: colors.accent},
  segment: {paddingHorizontal: spacing.gutter, paddingBottom: 12},
  sectionTitle: {paddingHorizontal: spacing.gutter, paddingBottom: spacing.s},
  bestBlock: {paddingTop: spacing.s, paddingBottom: spacing.m},
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginHorizontal: spacing.gutter,
    padding: 12,
    borderRadius: radii.button,
    backgroundColor: colors.surface1,
    overflow: 'hidden',
  },
  bestText: {flex: 1, minWidth: 0, gap: 4},
  bestName: {fontWeight: '700'},
  bestMeta: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  shrink: {flexShrink: 1},
  historyHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.gutter, paddingTop: spacing.s, paddingBottom: spacing.s},
  clear: {color: colors.accent},
  textRow: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: spacing.gutter},
  clock: {width: 48, alignItems: 'center'},
});
