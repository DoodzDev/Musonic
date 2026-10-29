/**
 * @file index.tsx
 * @description Library screen (Design v2, R5.3). Large title with the account
 *   avatar on the left and search, list/grid and new playlist on the right;
 *   tabs Playlists / Albums / Artists / Downloaded; the Liked songs and My
 *   music tiles; a sort line with the item count; then the items as rows or
 *   a grid. Pinned items stay on top of their tab. Long press opens the
 *   options of an item. Offline, only what was downloaded is listed.
 * @author DoodzProg
 * @version 2.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {LibraryStackParams} from '../../navigation/types';
import {LargeTitle, LargeTitleHeader, useLargeTitleInset, useLargeTitleScroll} from '../../components/ui/LargeTitleHeader';
import Text from '../../components/ui/Text';
import Chip from '../../components/ui/Chip';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import {SkeletonList} from '../../components/ui/Skeleton';
import CollectionRow from '../../components/ui/CollectionRow';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import PressableScale from '../../components/ui/PressableScale';
import ProfileButton from '../../components/shell/ProfileButton';
import {LibraryGridCard, LibraryTile} from '../../components/library/LibraryCards';
import PlaylistOptionsSheet from '../../components/PlaylistOptionsSheet';
import PlaylistInfoModal from '../../components/PlaylistInfoModal';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {CheckIcon, GridIcon, ListIcon, PinIcon, PlusIcon, SearchIcon, SortIcon, TrashIcon} from '../../components/icons';
import {getPlaylist, createPlaylist} from '../../api/endpoints/playlists';
import {unstar} from '../../api/endpoints/library';
import {useLibraryCollections} from '../../hooks/useLibraryCollections';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore, type LibrarySortMode} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useLibraryCacheStore} from '../../store/libraryCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {useRecentPlaysStore} from '../../store/recentPlaysStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, radii, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import {filterEntries, sortEntries, type LibraryEntry, type LibraryTab} from './libraryModel';
import {getFollowedPodcasts, type PodcastShow} from '../../api/endpoints/podcasts';

const TABS: LibraryTab[] = ['playlists', 'albums', 'artists', 'podcasts', 'downloads'];
const SORTS: LibrarySortMode[] = ['recent', 'added', 'alpha'];
const GUTTER = spacing.gutter;
const GRID_GAP = 14;
/** Smallest grid card: two columns in portrait, more in landscape. */
const GRID_MIN_CARD = 150;

type Nav = NativeStackNavigationProp<LibraryStackParams, 'LibraryHome'>;

export default function LibraryScreen() {
  const t = useT();
  const navigation = useNavigation<Nav>();
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const {width: winW} = useWindowDimensions();
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();
  const lib = useLibraryCollections();

  const [tab, setTab] = useState<LibraryTab>('playlists');
  const viewMode = useSettingsStore(s => s.libraryViewMode);
  const setViewMode = useSettingsStore(s => s.setLibraryViewMode);
  const sortMode = useSettingsStore(s => s.librarySortMode);
  const setSortMode = useSettingsStore(s => s.setLibrarySortMode);
  const pinnedIds = useSettingsStore(s => s.pinnedLibraryIds);
  const togglePinned = useSettingsStore(s => s.togglePinnedLibraryId);
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  // Shows the account follows, loaded when their tab opens (Musonic Server, ADR-023).
  const [podcasts, setPodcasts] = useState<PodcastShow[] | null>(null);
  useEffect(() => {
    if (tab !== 'podcasts' || isOfflineMode) return;
    getFollowedPodcasts().then(setPodcasts).catch(() => setPodcasts([]));
  }, [tab, isOfflineMode]);
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const lastPlayedPlaylists = useSettingsStore(s => s.lastPlayedPlaylists);
  const plays = useRecentPlaysStore(s => s.plays);
  const currentPlaylistId = usePlayerStore(s => s.currentPlaylistId);
  const bumpPlaylistVersion = usePlayerStore(s => s.bumpPlaylistVersion);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const cachedLikedSongs = usePlaylistCacheStore(s => s.cachedLikedSongs);
  const cachedPlaylistSongs = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const downloads = useDownloadStore(s => s.downloads);

  // ─── Entries ──────────────────────────────────────────────────────────────

  // Liked ids come from the server; started offline, from the copy saved on the last online visit.
  const likedCount = useMemo(() => {
    const ids = likedSongIds.size > 0 ? likedSongIds : new Set(cachedLikedSongs.map(s => String(s.id)));
    let count = ids.size;
    for (const [id, liked] of Object.entries(localLikeOverrides)) {
      if (liked && !ids.has(id)) count++;
      else if (!liked && ids.has(id)) count--;
    }
    return count;
  }, [likedSongIds, cachedLikedSongs, localLikeOverrides]);

  /** Last play of each playlist, album and artist, for the "Recent" sort. */
  const playedAt = useMemo(() => {
    const at: Record<string, number> = {...lastPlayedPlaylists};
    for (const p of plays) {
      if (p.kind === 'album' || p.kind === 'playlist' || p.kind === 'artist') at[p.id] = Math.max(at[p.id] ?? 0, p.playedAt);
    }
    return at;
  }, [lastPlayedPlaylists, plays]);

  const playlistEntries = useMemo<LibraryEntry[]>(() => lib.playlists.map(p => {
    // Online tracks cannot be downloaded: they do not count.
    const downloadable = (cachedPlaylistSongs[p.id] ?? []).filter(s => !String(s.id).startsWith('ext-'));
    return {
      kind: 'playlist',
      id: p.id,
      name: p.name,
      songCount: p.songCount,
      coverId: p.coverArt,
      downloadable: downloadable.length,
      downloaded: downloadable.filter(s => !!downloads[String(s.id)]).length,
    };
  }), [lib.playlists, cachedPlaylistSongs, downloads]);

  const entries = useMemo<LibraryEntry[]>(() => {
    const withDownloads = playlistEntries.filter(e => (e.downloaded ?? 0) > 0);
    switch (tab) {
      case 'playlists':
        return isOfflineMode ? withDownloads : playlistEntries;
      case 'albums':
        return isOfflineMode ? [] : lib.albums.map(a => ({kind: 'album', id: a.id, name: a.name, artist: a.artist, songCount: a.songCount, coverId: a.coverArt}));
      case 'artists':
        return isOfflineMode ? [] : lib.artists.map(a => ({kind: 'artist', id: a.id, name: a.name, coverId: a.coverArt}));
      case 'podcasts':
        return isOfflineMode ? [] : (podcasts ?? []).map(p => ({kind: 'podcast', id: p.id, name: p.title, artist: p.author, coverId: p.coverArt}));
      case 'downloads':
        return withDownloads;
    }
  }, [tab, isOfflineMode, playlistEntries, lib.albums, lib.artists, podcasts]);

  // Search (magnifier in the header): filters the current tab.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); }, []);

  const visible = useMemo(
    () => filterEntries(sortEntries(entries, sortMode, playedAt, pinned), query),
    [entries, sortMode, playedAt, pinned, query],
  );

  const subtitleOf = useCallback((e: LibraryEntry): string => {
    if (e.kind === 'podcast') return e.artist ?? t.library.tabs.podcasts;
    if (e.kind === 'album') return t.home.kindLine(t.home.typeAlbum, e.artist);
    if (e.kind === 'artist') return t.home.typeArtist;
    const count = tab === 'downloads' || isOfflineMode
      ? t.library.downloadedCount(e.downloaded ?? 0)
      : t.likedSongs.trackCount(e.songCount ?? 0);
    return t.home.kindLine(t.home.typePlaylist, count);
  }, [t, tab, isOfflineMode]);

  const fullyDownloaded = (e: LibraryEntry) => (e.downloadable ?? 0) > 0 && e.downloaded === e.downloadable;

  // ─── Navigation ───────────────────────────────────────────────────────────

  const open = useCallback((e: LibraryEntry) => {
    if (e.kind === 'playlist') navigation.navigate('PlaylistDetail', {playlistId: e.id});
    else if (e.kind === 'album') navigation.navigate('AlbumDetail', {albumId: e.id});
    else if (e.kind === 'podcast') navigation.navigate('PodcastDetail', {showId: e.id});
    else navigation.navigate('ArtistDetail', {artistId: e.id, artistName: e.name});
  }, [navigation]);

  // ─── Options ──────────────────────────────────────────────────────────────

  /** Playlist whose options sheet is open; the last one stays for the modals it opens. */
  const [playlistOptions, setPlaylistOptions] = useState<LibraryEntry | null>(null);
  const lastPlaylist = useRef<LibraryEntry | null>(null);
  if (playlistOptions) lastPlaylist.current = playlistOptions;
  /** Album or artist whose options sheet is open. */
  const [itemOptions, setItemOptions] = useState<LibraryEntry | null>(null);

  const onLongPress = useCallback((e: LibraryEntry) => {
    if (e.kind === 'playlist') setPlaylistOptions(e);
    else if (e.kind !== 'podcast') setItemOptions(e);
  }, []);

  const [infoVisible, setInfoVisible] = useState(false);
  const [infoView, setInfoView] = useState<'info' | 'cover'>('info');
  const [infoDescription, setInfoDescription] = useState('');
  const openInfo = useCallback((view: 'info' | 'cover') => {
    const p = lastPlaylist.current;
    if (!p) return;
    getPlaylist(p.id)
      .then(({playlist}) => setInfoDescription(playlist.comment ?? ''))
      .catch(() => setInfoDescription(''))
      .finally(() => { setInfoView(view); setInfoVisible(true); });
  }, []);

  const [addAllIds, setAddAllIds] = useState<string[]>([]);
  const [addAllVisible, setAddAllVisible] = useState(false);
  const addAll = useCallback(async () => {
    const p = lastPlaylist.current;
    if (!p) return;
    try {
      const {songs} = await getPlaylist(p.id);
      setAddAllIds(songs.map(s => String(s.id)));
      setAddAllVisible(true);
    } catch {
      showToast(getT().playlistOptions.queueError);
    }
  }, []);

  const downloadPlaylist = useCallback((p: LibraryEntry) => {
    const d = getT();
    Alert.alert(d.library.offlineDownloadTitle, d.library.offlineDownloadMessage(p.name, p.songCount ?? 0), [
      {text: d.playlistOptions.cancelButton, style: 'cancel'},
      {
        text: d.songOptions.download,
        onPress: async () => {
          try {
            const {songs} = await getPlaylist(p.id);
            useDownloadStore.getState().enqueueBatch(songs, () => showToast(getT().library.offlineDownloadComplete(p.name)));
            showToast(d.songOptions.downloadQueued);
          } catch {
            showToast(d.library.loadError);
          }
        },
      },
    ]);
  }, []);

  const deletePlaylistDownloads = useCallback((p: LibraryEntry) => {
    const d = getT();
    const songs = (cachedPlaylistSongs[p.id] ?? []).filter(s => !String(s.id).startsWith('ext-') && !!downloads[String(s.id)]);
    if (songs.length === 0) return;
    Alert.alert(d.downloads.deletePlaylistTitle, d.downloads.deletePlaylistMessage(p.name, songs.length), [
      {text: d.downloads.cancelButton, style: 'cancel'},
      {
        text: d.downloads.deleteConfirm,
        style: 'destructive',
        onPress: () => {
          const store = useDownloadStore.getState();
          for (const s of songs) store.deleteDownload(String(s.id));
        },
      },
    ]);
  }, [cachedPlaylistSongs, downloads]);

  const togglePin = useCallback((e: LibraryEntry) => {
    const was = pinned.has(e.id);
    togglePinned(e.id);
    showToast(was ? getT().library.unpinnedToast : getT().library.pinnedToast);
  }, [pinned, togglePinned]);

  const removeFromLibrary = useCallback(async (e: LibraryEntry) => {
    setItemOptions(null);
    try {
      await unstar(e.id);
      const cache = useLibraryCacheStore.getState();
      if (e.kind === 'album') cache.save({
        albums: cache.albums.filter(a => a.id !== e.id),
        starredAlbumIds: cache.starredAlbumIds.filter(id => id !== e.id),
      });
      else cache.save({
        artists: cache.artists.filter(a => a.id !== e.id),
        starredArtistIds: cache.starredArtistIds.filter(id => id !== e.id),
      });
      showToast(getT().library.removedToast);
    } catch {
      showToast(getT().library.removeError);
    }
  }, []);

  // ─── New playlist ─────────────────────────────────────────────────────────

  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const closeCreate = useCallback(() => { setCreateVisible(false); setNewName(''); }, []);
  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const playlist = await createPlaylist(name);
      closeCreate();
      bumpPlaylistVersion();
      if (playlist?.id) navigation.navigate('PlaylistDetail', {playlistId: playlist.id});
    } catch {
      showToast(getT().library.createPlaylistError);
    } finally {
      setCreating(false);
    }
  }, [newName, creating, closeCreate, bumpPlaylistVersion, navigation]);

  const [sortVisible, setSortVisible] = useState(false);

  // ─── Layout ───────────────────────────────────────────────────────────────

  const contentW = winW - (landscapePadding.paddingLeft ?? 0) - (landscapePadding.paddingRight ?? 0);
  const columns = Math.max(2, Math.floor((contentW - 2 * GUTTER + GRID_GAP) / (GRID_MIN_CARD + GRID_GAP)));
  const cardW = Math.floor((contentW - 2 * GUTTER - GRID_GAP * (columns - 1)) / columns);
  const grid = viewMode === 'grid';

  const renderItem = useCallback(({item}: {item: LibraryEntry}) => (
    grid ? (
      <LibraryGridCard
        kind={item.kind === 'podcast' ? 'album' : item.kind}
        name={item.name}
        subtitle={subtitleOf(item)}
        coverId={item.coverId}
        playlistId={item.kind === 'playlist' ? item.id : undefined}
        width={cardW}
        pinned={pinned.has(item.id)}
        active={currentPlaylistId === item.id}
        onPress={() => open(item)}
        onLongPress={() => onLongPress(item)}
      />
    ) : (
      <CollectionRow
        kind={item.kind === 'podcast' ? 'album' : item.kind}
        name={item.name}
        subtitle={subtitleOf(item)}
        coverId={item.coverId}
        playlistId={item.kind === 'playlist' ? item.id : undefined}
        badges={item.kind === 'playlist' && fullyDownloaded(item) ? ['downloaded'] : undefined}
        pinned={pinned.has(item.id)}
        active={currentPlaylistId === item.id}
        separator
        onPress={() => open(item)}
        onLongPress={() => onLongPress(item)}
      />
    )
  ), [grid, cardW, subtitleOf, pinned, currentPlaylistId, open, onLongPress]);

  const empty = (() => {
    if (lib.status === 'loading') return <SkeletonList />;
    if (lib.status === 'error') {
      return <EmptyState title={t.library.loadError} action={{label: t.common.retry, onPress: lib.retry}} />;
    }
    if (query.trim()) return <EmptyState title={t.library.searchNoResult} />;
    if (isOfflineMode && (tab === 'albums' || tab === 'artists')) {
      return <EmptyState title={t.library.empty.offline.title} message={t.library.empty.offline.message} />;
    }
    const copy = t.library.empty[tab];
    return (
      <EmptyState
        title={copy.title}
        message={copy.message}
        action={tab === 'playlists' && !isOfflineMode ? {label: t.library.createPlaylistTitle, onPress: () => setCreateVisible(true)} : undefined}
      />
    );
  })();

  const header = (
    <View>
      <LargeTitle title={t.library.title} scrollY={scrollY} />

      {searchOpen ? (
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <SearchField value={query} onChangeText={setQuery} placeholder={t.library.searchLibrary} autoFocus />
          </View>
          <Pressable onPress={closeSearch} hitSlop={8} accessibilityRole="button">
            <Text variant="body" style={styles.cancel}>{t.library.searchCancel}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {TABS.map(k => <Chip key={k} label={t.library.tabs[k]} selected={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView>

      {tab === 'playlists' && !query.trim() ? (
        <View style={styles.tiles}>
          <LibraryTile kind="liked" name={t.likedSongs.title} subtitle={t.likedSongs.trackCount(likedCount)} onPress={() => navigation.navigate('LikedSongs')} />
          <LibraryTile
            kind="allSongs"
            name={t.allSongs.title}
            subtitle={lib.songTotal ? t.allSongs.trackCount(lib.songTotal) : t.allSongs.tileSubtitle}
            onPress={() => navigation.navigate('AllSongs')}
          />
        </View>
      ) : null}

      {lib.stale ? <Text variant="footnote" color="textSecondary" style={styles.note}>{t.library.staleNote}</Text> : null}

      {visible.length > 0 ? (
        <View style={styles.sortRow}>
          <PressableScale onPress={() => setSortVisible(true)} hitSlop={10} accessibilityLabel={`${t.library.sortTitle}, ${t.library.sort[sortMode]}`} style={styles.sortBtn}>
            <SortIcon size={14} color={colors.textSecondary} />
            <Text variant="footnote" color="textSecondary" style={styles.sortLabel}>{t.library.sort[sortMode]}</Text>
          </PressableScale>
          <Text variant="footnote" color="textSecondary">{t.library.itemCount(visible.length)}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={isFullscreenMode} />

      <Animated.FlatList
        key={grid ? `grid-${columns}` : 'list'}
        data={visible as LibraryEntry[]}
        keyExtractor={e => `${e.kind}-${e.id}`}
        renderItem={renderItem}
        numColumns={grid ? columns : 1}
        columnWrapperStyle={grid ? styles.gridRow : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingTop: top, paddingBottom: dockInset + 16}}
        refreshControl={<RefreshControl refreshing={lib.refreshing} onRefresh={lib.refresh} tintColor={colors.accent} progressViewOffset={top} />}
      />

      <LargeTitleHeader
        title={t.library.title}
        scrollY={scrollY}
        align="left"
        left={<ProfileButton />}
        right={
          <View style={styles.actions}>
            <Button
              variant="icon"
              size={36}
              accessibilityLabel={t.library.searchLibrary}
              onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              icon={<SearchIcon size={18} color={colors.textPrimary} />}
            />
            <Button
              variant="icon"
              size={36}
              accessibilityLabel={grid ? t.library.showList : t.library.showGrid}
              onPress={() => setViewMode(grid ? 'list' : 'grid')}
              icon={grid ? <ListIcon size={18} color={colors.textPrimary} /> : <GridIcon size={18} color={colors.textPrimary} />}
            />
            {!isOfflineMode ? (
              <Button
                variant="icon"
                size={36}
                accessibilityLabel={t.library.createPlaylistTitle}
                onPress={() => setCreateVisible(true)}
                icon={<PlusIcon size={18} color={colors.accent} strokeWidth={2.6} />}
              />
            ) : null}
          </View>
        }
      />

      {/* ── Sheets ── */}
      <Sheet visible={sortVisible} onClose={() => setSortVisible(false)} title={t.library.sortTitle}>
        <View style={styles.sheetBody}>
          <ListGroup raised>
            {SORTS.map(m => (
              <ListItem
                key={m}
                label={t.library.sort[m]}
                accessory={sortMode === m ? <CheckIcon size={20} color={colors.accent} strokeWidth={2.5} /> : undefined}
                onPress={() => { setSortMode(m); setSortVisible(false); }}
              />
            ))}
          </ListGroup>
        </View>
      </Sheet>

      <Sheet visible={!!itemOptions} onClose={() => setItemOptions(null)} title={itemOptions?.name}>
        <View style={styles.sheetBody}>
          <ListGroup raised>
            {itemOptions ? (
              <ListItem
                label={pinned.has(itemOptions.id) ? t.library.unpin : t.library.pin}
                icon={<PinIcon size={20} color={pinned.has(itemOptions.id) ? colors.accent : colors.textPrimary} filled={pinned.has(itemOptions.id)} />}
                onPress={() => { togglePin(itemOptions); setItemOptions(null); }}
              />
            ) : null}
            {itemOptions && (itemOptions.kind === 'album' ? lib.starredAlbumIds : lib.starredArtistIds).includes(itemOptions.id) ? (
              <ListItem
                label={t.library.removeFromLibrary}
                icon={<TrashIcon size={20} color={colors.destructive} />}
                destructive
                onPress={() => removeFromLibrary(itemOptions)}
              />
            ) : null}
          </ListGroup>
        </View>
      </Sheet>

      <PlaylistOptionsSheet
        visible={!!playlistOptions}
        onClose={() => setPlaylistOptions(null)}
        playlist={playlistOptions ? {id: playlistOptions.id, name: playlistOptions.name, coverArt: playlistOptions.coverId, songCount: playlistOptions.songCount ?? 0} : null}
        isPinned={playlistOptions ? pinned.has(playlistOptions.id) : false}
        onTogglePin={() => { if (playlistOptions) togglePinned(playlistOptions.id); }}
        onToast={showToast}
        onDeleted={() => { setPlaylistOptions(null); bumpPlaylistVersion(); }}
        onStartEdit={() => { const p = lastPlaylist.current; if (p) navigation.navigate('PlaylistDetail', {playlistId: p.id, autoEdit: true}); }}
        onOpenInfo={() => openInfo('info')}
        onOpenCover={() => openInfo('cover')}
        onAddAll={addAll}
        onDownload={isOfflineMode ? undefined : () => { if (lastPlaylist.current) downloadPlaylist(lastPlaylist.current); }}
        onDeleteDownloads={playlistOptions && (playlistOptions.downloaded ?? 0) > 0 ? () => { if (lastPlaylist.current) deletePlaylistDownloads(lastPlaylist.current); } : undefined}
      />
      <PlaylistInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        playlistId={lastPlaylist.current?.id ?? ''}
        initialName={lastPlaylist.current?.name ?? ''}
        initialDescription={infoDescription}
        coverArtId={lastPlaylist.current?.coverId}
        onSaved={() => { bumpPlaylistVersion(); showToast(getT().playlistInfo.saved); }}
        onDeleted={() => { setInfoVisible(false); bumpPlaylistVersion(); }}
        initialView={infoView}
      />
      <AddToPlaylistSheet visible={addAllVisible} onClose={() => setAddAllVisible(false)} trackIds={addAllIds} onToast={showToast} />

      {/* ── New playlist ── */}
      <Modal visible={createVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={closeCreate}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.ui.close} style={styles.dialogBackdrop} onPress={closeCreate}>
          <Pressable accessible={false} style={styles.dialog} onPress={() => {}}>
            <Text variant="headline" style={styles.dialogTitle}>{t.library.createPlaylistTitle}</Text>
            <TextInput
              style={styles.dialogInput}
              placeholder={t.library.createPlaylistPlaceholder}
              placeholderTextColor={colors.textSecondary}
              selectionColor={colors.accent}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={create}
            />
            <View style={styles.dialogActions}>
              <Pressable onPress={closeCreate} style={styles.dialogBtn} accessibilityRole="button">
                <Text variant="body" color="textSecondary">{t.library.createPlaylistCancel}</Text>
              </Pressable>
              <View style={styles.dialogDivider} />
              <Pressable onPress={create} disabled={creating || !newName.trim()} style={styles.dialogBtn} accessibilityRole="button">
                {creating
                  ? <ActivityIndicator color={colors.accent} />
                  : <Text variant="body" style={[styles.dialogConfirm, !newName.trim() && styles.disabled]}>{t.library.createPlaylistConfirm}</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  actions: {flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  searchRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingBottom: 14},
  searchField: {flex: 1},
  cancel: {color: colors.accent},
  // A horizontal ScrollView may shrink to nothing in a long page: keep its own height.
  chipsScroll: {flexGrow: 0, flexShrink: 0},
  chips: {paddingHorizontal: GUTTER, gap: spacing.s, paddingTop: 4, paddingBottom: 18},
  tiles: {flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingBottom: 22},
  note: {paddingHorizontal: GUTTER, paddingBottom: 12},
  sortRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: 6},
  sortBtn: {flexDirection: 'row', alignItems: 'center', gap: 6},
  sortLabel: {fontWeight: '600'},
  gridRow: {gap: GRID_GAP, paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 12},
  sheetBody: {paddingHorizontal: spacing.m, paddingBottom: spacing.m},
  dialogBackdrop: {flex: 1, backgroundColor: colors.backdrop, justifyContent: 'center', alignItems: 'center', padding: 40},
  dialog: {width: '100%', maxWidth: 340, backgroundColor: colors.surface1, borderRadius: radii.card, overflow: 'hidden'},
  dialogTitle: {textAlign: 'center', paddingTop: 20, paddingHorizontal: 20},
  dialogInput: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 18,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radii.cover,
    backgroundColor: colors.fill,
    color: colors.textPrimary,
    fontSize: 16,
  },
  dialogActions: {flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator},
  dialogBtn: {flex: 1, height: 46, alignItems: 'center', justifyContent: 'center'},
  dialogDivider: {width: StyleSheet.hairlineWidth, backgroundColor: colors.separator},
  dialogConfirm: {color: colors.accent, fontWeight: '600'},
  disabled: {opacity: 0.4},
});
