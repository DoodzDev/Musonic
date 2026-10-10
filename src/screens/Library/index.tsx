/**
 * @file index.tsx
 * @description Library screen. Lists the user's playlists, starred albums,
 *   liked songs, and the "My Music" full-library entry in list or grid view
 *   with sort options, pin support, pull-to-refresh, and auto-recovery on
 *   connectivity restore.
 * @author DoodzProg
 * @version 1.0.6
 * @license MIT
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
  Modal,
  PanResponder,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useHeaderTopInset} from '../../hooks/useHeaderTopInset';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import {darkTheme} from '../../theme';
import CoverArt from '../../components/CoverArt';
import {getPlaylists, getPlaylist, createPlaylist} from '../../api/endpoints/playlists';
import {getStarred} from '../../api/endpoints/library';
import {usePlayerStore} from '../../store/playerStore';
import type {SubsonicPlaylist, SubsonicAlbum} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';
import PlaylistOptionsSheet from '../../components/PlaylistOptionsSheet';
import PlaylistInfoModal from '../../components/PlaylistInfoModal';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import LogoIcon from '../../components/icons/LogoIcon';
import {useDrawer} from '../../components/DrawerContainer';
import HeartIcon from '../../components/icons/HeartIcon';
import {useT, getT} from '../../i18n';
import {useNetworkStore} from '../../store/networkStore';
import {useSettingsStore, type LibrarySortMode} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import DownloadIcon from '../../components/icons/DownloadIcon';


type ViewMode = 'list' | 'grid';
type SortMode = LibrarySortMode;

type LibraryItem = {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  coverArt?: string;
  isLiked?: boolean;
  isAllSongs?: boolean;
  kind: 'liked' | 'allSongs' | 'playlist' | 'album';
  artist?: string;
};


const SHEET_CLOSE_OFFSET = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m} min`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function SearchIcon({size = 22, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={2} fill="none" />
      <Path d="M15.5 15.5 L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon({size = 26, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 4 V20 M4 12 H20"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SortIcon({size = 20, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 4 V18 M2 15 L5 19 L8 15"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M16 20 V6 M13 9 L16 5 L19 9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function GridIcon({size = 22, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2" y="2" width="9" height="9" rx="1.5" fill={color} />
      <Rect x="13" y="2" width="9" height="9" rx="1.5" fill={color} />
      <Rect x="2" y="13" width="9" height="9" rx="1.5" fill={color} />
      <Rect x="13" y="13" width="9" height="9" rx="1.5" fill={color} />
    </Svg>
  );
}

function ListIcon({size = 22, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="3.5" cy="6" r="1.8" fill={color} />
      <Path d="M7 6 H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="3.5" cy="12" r="1.8" fill={color} />
      <Path d="M7 12 H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="3.5" cy="18" r="1.8" fill={color} />
      <Path d="M7 18 H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PinIcon({size = 26, color = '#fff', filled = false}: {size?: number; color?: string; filled?: boolean}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 2 L15 2 L15 8 L18 11 L13.5 11 L13.5 21 L12 22 L10.5 21 L10.5 11 L6 11 L9 8 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
        transform="rotate(45, 12, 12)"
      />
    </Svg>
  );
}

function CheckIcon({size = 20, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 12 L9 17 L20 6"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function NowPlayingBars() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M3 18 V10 M8 18 V4 M13 18 V8 M18 18 V14"
        stroke={darkTheme.accent}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Liked Cover ──────────────────────────────────────────────────────────────

function LikedCover({size, borderRadius = 6}: {size: number; borderRadius?: number}) {
  const coverStyle = {width: size, height: size, borderRadius, alignItems: 'center' as const, justifyContent: 'center' as const};
  return (
    <LinearGradient
      colors={['#6B2FA0', '#1E3A8A']}
      style={coverStyle}>
      <HeartIcon size={size * 0.45} color="#fff" filled />
    </LinearGradient>
  );
}

// ─── All Songs Cover ──────────────────────────────────────────────────────────

function AllSongsCover({size, borderRadius = 6}: {size: number; borderRadius?: number}) {
  const coverStyle = {width: size, height: size, borderRadius, alignItems: 'center' as const, justifyContent: 'center' as const};
  return (
    <LinearGradient
      colors={['#2C3E50', '#12181f']}
      style={coverStyle}>
      <Svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24">
        <Path
          d="M9 18V5l12-2v13"
          stroke="#fff"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx="6" cy="18" r="3" stroke="#fff" strokeWidth={1.8} fill="none" />
        <Circle cx="18" cy="16" r="3" stroke="#fff" strokeWidth={1.8} fill="none" />
      </Svg>
    </LinearGradient>
  );
}

// ─── Default Cover ────────────────────────────────────────────────────────────

function DefaultCover({size}: {size: number}) {
  return (
    <View style={[styles.defaultCover, {width: size, height: size}]}>
      <Svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24">
        <Path d="M3 6 H21" stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M3 12 H21" stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
        <Path d="M3 18 H15" stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

// ─── Bottom Sheet hook ────────────────────────────────────────────────────────

function useBottomSheet(onClose: () => void) {
  const [modalVisible, setModalVisible] = useState(false);
  const modalVisibleRef = useRef(false);
  const slideY = useRef(new Animated.Value(SHEET_CLOSE_OFFSET)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (!modalVisibleRef.current) return;
    Animated.timing(slideY, {
      toValue: SHEET_CLOSE_OFFSET,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      dragY.setValue(0);
      modalVisibleRef.current = false;
      setModalVisible(false);
      onCloseRef.current();
    });
  }, [slideY, dragY]);

  const closeRef = useRef(close);
  closeRef.current = close;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, {dy, dx}) => dy > 5 && Math.abs(dy) > Math.abs(dx),
      onMoveShouldSetPanResponderCapture: (_, {dy, dx}) => dy > 5 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, {dy}) => {
        if (dy > 0) dragY.setValue(dy);
      },
      onPanResponderRelease: (_, {dy, vy}) => {
        if (dy > 50 || vy > 0.4) {
          closeRef.current();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 2,
          }).start();
        }
      },
    }),
  ).current;

  const open = useCallback(() => {
    slideY.setValue(SHEET_CLOSE_OFFSET);
    dragY.setValue(0);
    modalVisibleRef.current = true;
    setModalVisible(true);
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 3,
      speed: 22,
    }).start();
  }, [slideY, dragY]);

  return {
    modalVisible,
    slideY,
    dragY,
    panHandlers: panResponder.panHandlers,
    open,
    close,
    closeRef,
  };
}

// ─── Sort Sheet ───────────────────────────────────────────────────────────────

type SortSheetProps = {
  visible: boolean;
  current: SortMode;
  onSelect: (m: SortMode) => void;
  onClose: () => void;
};

function SortSheet({visible, current, onSelect, onClose}: SortSheetProps) {
  const t = useT();
  const SORT_OPTIONS: {key: SortMode; label: string}[] = [
    {key: 'recent', label: t.library.sort.recent},
    {key: 'added', label: t.library.sort.added},
    {key: 'alpha', label: t.library.sort.alpha},
  ];
  const sheet = useBottomSheet(onClose);

  useEffect(() => {
    if (visible) sheet.open();
    else sheet.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const translateY = Animated.add(sheet.slideY, sheet.dragY);

  return (
    <Modal
      visible={sheet.modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={sheet.closeRef.current}>
      <View style={styles.modalRoot}>
        <TouchableWithoutFeedback onPress={sheet.close}>
          <View style={[StyleSheet.absoluteFill, styles.overlay]} />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[styles.sheet, {transform: [{translateY}]}]}
          {...sheet.panHandlers}>
          <View style={styles.dragHandle} />
          <Text style={styles.sheetTitle}>{t.library.sortTitle}</Text>
          <View style={styles.sheetDivider} />
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={styles.sheetRow}
              onPress={() => {
                onSelect(opt.key);
                sheet.close();
              }}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.sheetLabel,
                  current === opt.key && {color: darkTheme.accent},
                ]}>
                {opt.label}
              </Text>
              {current === opt.key && (
                <CheckIcon size={20} color={darkTheme.accent} />
              )}
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}


// ─── List Row ─────────────────────────────────────────────────────────────────

type RowProps = {
  item: LibraryItem;
  isActive: boolean;
  isLoading: boolean;
  isPinned: boolean;
  onPress: (id: string) => void;
  onLongPress: (item: LibraryItem) => void;
  onDownload?: () => void;
  onDeleteDownloads?: () => void;
  allDownloaded?: boolean;
};

function rowSubtitle(item: LibraryItem): string {
  const d = getT();
  if (item.kind === 'liked') {
    return d.library.likedTrackCount(item.songCount);
  }
  if (item.kind === 'allSongs') {
    return d.allSongs.tileSubtitle;
  }
  if (item.kind === 'album') {
    return `Album • ${item.artist ?? ''}`;
  }
  const dur = item.duration > 0 ? ` · ${formatDuration(item.duration)}` : '';
  return `Playlist • ${d.likedSongs.trackCount(item.songCount)}${dur}`;
}

function PlaylistRow({
  item,
  isActive,
  isLoading,
  isPinned,
  onPress,
  onLongPress,
  onDownload,
  onDeleteDownloads,
  allDownloaded,
}: RowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(item.id)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      activeOpacity={0.7}>
      {item.isLiked ? (
        <LikedCover size={65} />
      ) : item.isAllSongs ? (
        <AllSongsCover size={65} />
      ) : item.coverArt || item.kind === 'playlist' ? (
        <CoverArt id={item.coverArt} size={65} borderRadius={6} playlistId={item.kind === 'playlist' ? item.id : undefined} />
      ) : (
        <DefaultCover size={65} />
      )}
      <View style={styles.rowInfo}>
        <Text
          style={[styles.rowName, isActive && {color: darkTheme.accent}]}
          numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.rowSubRow}>
          {isPinned && (
            <View style={styles.gridPin}>
              <PinIcon size={18} color={darkTheme.accent} filled={true} />
            </View>
          )}
          <Text style={styles.rowSub} numberOfLines={1}>
            {rowSubtitle(item)}
          </Text>
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={darkTheme.accent} />
      ) : isActive ? (
        <NowPlayingBars />
      ) : allDownloaded ? (
        <TouchableOpacity
          onPress={onDeleteDownloads}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}>
          <DownloadIcon size={20} color="#1ED760" />
        </TouchableOpacity>
      ) : onDownload ? (
        <TouchableOpacity
          onPress={onDownload}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}>
          <DownloadIcon size={20} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

type GridCardProps = {
  item: LibraryItem;
  isActive: boolean;
  isLoading: boolean;
  colWidth: number;
  onPress: (id: string) => void;
  onLongPress: (item: LibraryItem) => void;
};

function PlaylistGridCard({
  item,
  isActive,
  isLoading,
  colWidth,
  onPress,
  onLongPress,
}: GridCardProps) {
  const t = useT();
  const imgSize = colWidth - 8;
  const gridSub =
    item.kind === 'album'
      ? item.artist ?? ''
      : item.kind === 'allSongs'
      ? t.allSongs.tileSubtitle
      : isLoading
      ? '…'
      : t.likedSongs.trackCount(item.songCount);

  return (
    <TouchableOpacity
      style={[styles.gridCard, {width: colWidth}]}
      onPress={() => onPress(item.id)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      activeOpacity={0.7}>
      {item.isLiked ? (
        <LikedCover size={imgSize} borderRadius={8} />
      ) : item.isAllSongs ? (
        <AllSongsCover size={imgSize} borderRadius={8} />
      ) : item.coverArt || item.kind === 'playlist' ? (
        <CoverArt id={item.coverArt} size={imgSize} borderRadius={8} playlistId={item.kind === 'playlist' ? item.id : undefined} />
      ) : (
        <DefaultCover size={imgSize} />
      )}
      <Text
        style={[styles.gridName, isActive && {color: darkTheme.accent}]}
        numberOfLines={2}
        ellipsizeMode="tail">
        {item.name}
      </Text>
      <Text style={styles.gridSub} numberOfLines={1}>
        {gridSub}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const t = useT();
  const landscapePadding = useLandscapeSidebarPadding();
  const {width: winW} = useWindowDimensions();
  const {open: openDrawer} = useDrawer();

  const SORT_LABELS: Partial<Record<SortMode, string>> = {
    recent: t.library.sort.recent,
    added: t.library.sort.added,
    alpha: t.library.sort.alpha,
  };

  const topInset = useHeaderTopInset();

  const navigation =
    useNavigation<NativeStackNavigationProp<LibraryStackParams, 'LibraryHome'>>();

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const sortMode: SortMode = useSettingsStore(s => s.librarySortMode);
  const setLibrarySortMode = useSettingsStore(s => s.setLibrarySortMode);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set(['liked']));

  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [optionsItem, setOptionsItem] = useState<LibraryItem | null>(null);
  const lastOptionsItem = useRef<LibraryItem | null>(null);
  if (optionsItem) lastOptionsItem.current = optionsItem;

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalInitialView, setInfoModalInitialView] = useState<'info' | 'cover'>('info');
  const [infoModalDescription, setInfoModalDescription] = useState('');
  const [addAllVisible, setAddAllVisible] = useState(false);
  const [addAllTrackIds, setAddAllTrackIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const currentPlaylistId = usePlayerStore(s => s.currentPlaylistId);
  const lastPlayedPlaylists = useSettingsStore(s => s.lastPlayedPlaylists);
  const playlistVersion = usePlayerStore(s => s.playlistVersion);
  const bumpPlaylistVersion = usePlayerStore(s => s.bumpPlaylistVersion);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);

  const likedCount = useMemo(() => {
    let count = likedSongIds.size;
    for (const [id, liked] of Object.entries(localLikeOverrides)) {
      const inSet = likedSongIds.has(id);
      if (liked && !inSet) count++;
      else if (!liked && inSet) count--;
    }
    return count;
  }, [likedSongIds, localLikeOverrides]);

  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const cachedPlaylistSongs = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const downloads = useDownloadStore(s => s.downloads);

  const [refreshing, setRefreshing] = useState(false);
  const fetchItems = useCallback(async () => {
    if (isOfflineMode) {
      const {cachedPlaylists, getOfflineSongs} = usePlaylistCacheStore.getState();
      const {downloads: dlMap} = useDownloadStore.getState();
      const cached = cachedPlaylists.filter((p: SubsonicPlaylist) =>
        getOfflineSongs(p.id).some(s => !!dlMap[String(s.id)]),
      );
      const plItems: LibraryItem[] = cached.map((p: SubsonicPlaylist) => ({
        id: p.id,
        name: p.name,
        songCount: p.songCount,
        duration: p.duration,
        coverArt: p.coverArt,
        kind: 'playlist' as const,
      }));
      setItems(plItems);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [plData, starData] = await Promise.all([
        getPlaylists(),
        getStarred().catch(() => ({songs: [], albums: [], artists: []})),
      ]);
      const plItems: LibraryItem[] = plData.map((p: SubsonicPlaylist) => ({
        id: p.id,
        name: p.name,
        songCount: p.songCount,
        duration: p.duration,
        coverArt: p.coverArt,
        kind: 'playlist' as const,
      }));
      const albumItems: LibraryItem[] = starData.albums.map((a: SubsonicAlbum) => ({
        id: a.id,
        name: a.name,
        songCount: a.songCount,
        duration: a.duration,
        coverArt: a.coverArt,
        kind: 'album' as const,
        artist: a.artist,
      }));
      setItems([...plItems, ...albumItems]);
      setLikedSongs(starData.songs.map((s: any) => String(s.id)));
      setError(null);
    } catch {
      setError(getT().library.loadError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setLikedSongs, isOfflineMode]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, playlistVersion]);

  // ─── Auto-recovery when connectivity is restored ──────────────────────────
  const isOffline = useNetworkStore(s => s.isOffline);
  const prevOfflineRef = useRef(isOffline);
  const errorRef = useRef(error);
  errorRef.current = error;

  useEffect(() => {
    const wasOffline = prevOfflineRef.current;
    prevOfflineRef.current = isOffline;
    if (wasOffline && !isOffline && errorRef.current !== null) {
      setLoading(true);
      setError(null);
      fetchItems();
    }
  }, [isOffline, fetchItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    bumpPlaylistVersion();
  }, [bumpPlaylistVersion]);

  const likedItem = useMemo<LibraryItem>(
    () => ({
      id: 'liked',
      name: getT().likedSongs.title,
      songCount: likedCount,
      duration: 0,
      isLiked: true,
      kind: 'liked',
    }),
    [likedCount],
  );

  const allSongsItem = useMemo<LibraryItem>(
    () => ({
      id: 'allSongs',
      name: getT().allSongs.title,
      songCount: 0,
      duration: 0,
      isAllSongs: true,
      kind: 'allSongs',
    }),
    [],
  );

  const allItems = useMemo<LibraryItem[]>(
    () => [likedItem, allSongsItem, ...items],
    [likedItem, allSongsItem, items],
  );

  const handlePress = useCallback(
    (id: string) => {
      const item = allItems.find(i => i.id === id);
      if (!item) return;
      if (item.kind === 'liked') {
        navigation.navigate('LikedSongs');
      } else if (item.kind === 'allSongs') {
        navigation.navigate('AllSongs');
      } else if (item.kind === 'album') {
        navigation.navigate('AlbumDetail', {albumId: id});
      } else {
        navigation.navigate('PlaylistDetail', {playlistId: id});
      }
    },
    [navigation, allItems],
  );

  const handleLongPress = useCallback((item: LibraryItem) => {
    if (item.kind === 'playlist') setOptionsItem(item);
  }, []);

  const handleTogglePin = useCallback(() => {
    if (!optionsItem) return;
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(optionsItem.id)) next.delete(optionsItem.id);
      else next.add(optionsItem.id);
      return next;
    });
  }, [optionsItem]);

  const handleSortSelect = useCallback(
    (mode: SortMode) => { setLibrarySortMode(mode); },
    [setLibrarySortMode],
  );

  const openInfoModal = useCallback((initialView: 'info' | 'cover') => {
    const item = lastOptionsItem.current;
    if (!item) return;
    getPlaylist(item.id)
      .then(({playlist}) => { setInfoModalDescription(playlist.comment ?? ''); })
      .catch(() => { setInfoModalDescription(''); })
      .finally(() => {
        setInfoModalInitialView(initialView);
        setInfoModalVisible(true);
      });
  }, []);

  const handleOpenInfo = useCallback(() => openInfoModal('info'), [openInfoModal]);
  const handleOpenCover = useCallback(() => openInfoModal('cover'), [openInfoModal]);

  const handleAddAll = useCallback(async () => {
    const item = lastOptionsItem.current;
    if (!item) return;
    try {
      const {songs} = await getPlaylist(item.id);
      setAddAllTrackIds(songs.map(s => String(s.id)));
      setAddAllVisible(true);
    } catch {
      showToast(getT().playlistOptions.queueError);
    }
  }, []);

  const handleDownloadPlaylist = useCallback((item: LibraryItem) => {
    const d = getT();
    Alert.alert(
      d.library.offlineDownloadTitle,
      d.library.offlineDownloadMessage(item.name, item.songCount),
      [
        {text: d.playlistOptions.cancelButton, style: 'cancel'},
        {
          text: d.songOptions.download,
          onPress: async () => {
            try {
              const {songs} = await getPlaylist(item.id);
              const playlistName = item.name;
              useDownloadStore.getState().enqueueBatch(songs, () => {
                showToast(getT().library.offlineDownloadComplete(playlistName));
              });
              showToast(d.songOptions.downloadQueued);
            } catch {
              showToast(d.library.loadError);
            }
          },
        },
      ],
    );
  }, []);

  const handleDeletePlaylistDownloads = useCallback((item: LibraryItem) => {
    const d = getT();
    const songs = cachedPlaylistSongs[item.id] ?? [];
    const downloadable = songs.filter(s => !String(s.id).startsWith('ext-') && !!downloads[String(s.id)]);
    if (downloadable.length === 0) return;
    Alert.alert(
      d.downloads.deletePlaylistTitle,
      d.downloads.deletePlaylistMessage(item.name, downloadable.length),
      [
        {text: d.downloads.cancelButton, style: 'cancel'},
        {
          text: d.downloads.deleteConfirm,
          style: 'destructive',
          onPress: () => {
            const store = useDownloadStore.getState();
            for (const s of downloadable) {
              store.deleteDownload(String(s.id));
            }
          },
        },
      ],
    );
  }, [cachedPlaylistSongs, downloads]);

  const handleStartEditFromLibrary = useCallback(() => {
    const item = lastOptionsItem.current;
    if (!item) return;
    navigation.navigate('PlaylistDetail', {playlistId: item.id, autoEdit: true});
  }, [navigation]);

  const handleInfoSaved = useCallback((name: string, _desc: string) => {
    const item = lastOptionsItem.current;
    if (item) setItems(prev => prev.map(i => i.id === item.id ? {...i, name} : i));
    showToast(getT().playlistInfo.saved);
  }, []);

  const handleInfoDeleted = useCallback(() => {
    const item = lastOptionsItem.current;
    if (item) setItems(prev => prev.filter(i => i.id !== item.id));
    setInfoModalVisible(false);
  }, []);

  const handleCreatePlaylist = useCallback(async () => {
    const name = newPlaylistName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      await createPlaylist(name);
      setShowCreateModal(false);
      setNewPlaylistName('');
      bumpPlaylistVersion();
    } catch {
      showToast(getT().library.createPlaylistError);
    } finally {
      setIsCreating(false);
    }
  }, [newPlaylistName, isCreating, bumpPlaylistVersion]);

  const sortedItems = useMemo<LibraryItem[]>(() => {
    // Liked Songs + All Songs are always absolute first (in that order) —
    // excluded from sort and pin logic, same as Liked Songs.
    const liked = allItems.find(p => p.id === 'liked');
    const allSongs = allItems.find(p => p.id === 'allSongs');
    const pool = allItems.filter(p => p.id !== 'liked' && p.id !== 'allSongs');

    let ordered: LibraryItem[];
    if (sortMode === 'recent') {
      ordered = [...pool].sort((a, b) => {
        const ta = lastPlayedPlaylists[a.id] ?? 0;
        const tb = lastPlayedPlaylists[b.id] ?? 0;
        return tb - ta;
      });
    } else if (sortMode === 'alpha') {
      ordered = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      ordered = pool;
    }
    const pinned = ordered.filter(p => pinnedIds.has(p.id));
    const rest = ordered.filter(p => !pinnedIds.has(p.id));
    const fixed = [liked, allSongs].filter((p): p is LibraryItem => !!p);
    return [...fixed, ...pinned, ...rest];
  }, [allItems, sortMode, pinnedIds, lastPlayedPlaylists]);

  const colWidth = Math.floor((winW - landscapePadding.paddingLeft - landscapePadding.paddingRight - 32) / 3);

  return (
    <View style={[styles.root, landscapePadding, {paddingTop: topInset}]}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />

      {/* ── Top Header ── */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <TouchableOpacity onPress={openDrawer} activeOpacity={0.7} style={styles.logoBtn}>
            <LogoIcon size={36} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.library.title}</Text>
        </View>
        <View style={styles.topHeaderRight}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <SearchIcon size={22} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => setShowCreateModal(true)}>
            <PlusIcon size={26} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Content ── */}
      <View style={styles.content}>
        <View style={styles.fadeOverlay} pointerEvents="none">
          <LinearGradient
            colors={[darkTheme.background, 'transparent']}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={darkTheme.accent} />
          </View>
        )}
        {!!error && (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setLoading(true); setError(null); fetchItems(); }}
              activeOpacity={0.7}>
              <Text style={styles.retryText}>{t.common.retry}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && (
          <FlashList
            key={viewMode}
            data={sortedItems}
            keyExtractor={item => item.id}
            numColumns={viewMode === 'grid' ? 3 : 1}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={darkTheme.accent}
                colors={[darkTheme.accent]}
              />
            }
            contentContainerStyle={[
              styles.listContent,
              viewMode === 'grid' && styles.listContentGrid,
            ]}
            ListHeaderComponent={
              <View style={styles.controls}>
                <TouchableOpacity
                  style={styles.sortBtn}
                  onPress={() => setSortSheetVisible(true)}
                  activeOpacity={0.7}>
                  <SortIcon size={18} color={darkTheme.textSecondary} />
                  <Text style={styles.sortLabel}>{SORT_LABELS[sortMode] ?? SORT_LABELS.added}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() =>
                    setViewMode(v => (v === 'list' ? 'grid' : 'list'))
                  }
                  activeOpacity={0.7}>
                  {viewMode === 'list' ? (
                    <GridIcon size={22} />
                  ) : (
                    <ListIcon size={22} />
                  )}
                </TouchableOpacity>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  {isOfflineMode ? t.library.offlineEmptyState : t.library.emptyState}
                </Text>
              </View>
            }
            renderItem={({item}) =>
              viewMode === 'grid' ? (
                <PlaylistGridCard
                  item={item}
                  isActive={currentPlaylistId === item.id}
                  isLoading={false}
                  colWidth={colWidth}
                  onPress={handlePress}
                  onLongPress={handleLongPress}
                />
              ) : (
                <PlaylistRow
                  item={item}
                  isActive={currentPlaylistId === item.id}
                  isLoading={false}
                  isPinned={pinnedIds.has(item.id)}
                  onPress={handlePress}
                  onLongPress={handleLongPress}
                  onDownload={!isOfflineMode && item.kind === 'playlist' ? () => handleDownloadPlaylist(item) : undefined}
                  onDeleteDownloads={item.kind === 'playlist' ? () => handleDeletePlaylistDownloads(item) : undefined}
                  allDownloaded={item.kind === 'playlist' && (() => {
                    const songs = cachedPlaylistSongs[item.id] ?? [];
                    const downloadable = songs.filter(s => !String(s.id).startsWith('ext-'));
                    return downloadable.length > 0 && downloadable.every(s => !!downloads[String(s.id)]);
                  })()}
                />
              )
            }
          />
        )}
      </View>

      {/* ── Sheets ── */}
      <SortSheet
        visible={sortSheetVisible}
        current={sortMode}
        onSelect={handleSortSelect}
        onClose={() => setSortSheetVisible(false)}
      />
      <PlaylistOptionsSheet
        visible={optionsItem !== null}
        onClose={() => setOptionsItem(null)}
        playlist={
          optionsItem
            ? {id: optionsItem.id, name: optionsItem.name, coverArt: optionsItem.coverArt, songCount: optionsItem.songCount}
            : null
        }
        isPinned={optionsItem ? pinnedIds.has(optionsItem.id) : false}
        onTogglePin={handleTogglePin}
        onToast={showToast}
        onDeleted={() => {
          if (optionsItem) {
            setItems(prev => prev.filter(i => i.id !== optionsItem.id));
            setOptionsItem(null);
          }
        }}
        onStartEdit={handleStartEditFromLibrary}
        onOpenInfo={handleOpenInfo}
        onOpenCover={handleOpenCover}
        onAddAll={handleAddAll}
        onDownload={() => { if (lastOptionsItem.current) handleDownloadPlaylist(lastOptionsItem.current); }}
      />
      <PlaylistInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        playlistId={lastOptionsItem.current?.id ?? ''}
        initialName={lastOptionsItem.current?.name ?? ''}
        initialDescription={infoModalDescription}
        coverArtId={lastOptionsItem.current?.coverArt}
        onSaved={handleInfoSaved}
        onDeleted={handleInfoDeleted}
        initialView={infoModalInitialView}
      />
      <AddToPlaylistSheet
        visible={addAllVisible}
        onClose={() => setAddAllVisible(false)}
        trackIds={addAllTrackIds}
        onToast={showToast}
      />

      {/* ── Create Playlist Modal ── */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}>
        <TouchableWithoutFeedback onPress={() => { setShowCreateModal(false); setNewPlaylistName(''); }}>
          <View style={styles.createModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.createModalBox}>
                <Text style={styles.createModalTitle}>{t.library.createPlaylistTitle}</Text>
                <TextInput
                  style={styles.createModalInput}
                  placeholder={t.library.createPlaylistPlaceholder}
                  placeholderTextColor={darkTheme.textSecondary}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreatePlaylist}
                />
                <View style={styles.createModalActions}>
                  <TouchableOpacity
                    onPress={() => { setShowCreateModal(false); setNewPlaylistName(''); }}
                    style={styles.createModalBtn}>
                    <Text style={styles.createModalBtnCancel}>{t.library.createPlaylistCancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreatePlaylist}
                    disabled={isCreating || !newPlaylistName.trim()}
                    style={styles.createModalBtn}>
                    <Text style={[styles.createModalBtnConfirm, (!newPlaylistName.trim() || isCreating) && styles.disabledOpacity]}>
                      {t.library.createPlaylistConfirm}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: darkTheme.background,
    zIndex: 20,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: darkTheme.textPrimary,
    letterSpacing: -0.3,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 8,
  },
  fadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    zIndex: 10,
  },
  content: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: darkTheme.textSecondary,
  },
  viewBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 140,
    paddingTop: 4,
  },
  listContentGrid: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 14,
  },
  defaultCover: {
    borderRadius: 6,
    backgroundColor: darkTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: darkTheme.textPrimary,
  },
  rowSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  pinWrap: {
    marginTop: 1,
  },
  rowSub: {
    fontSize: 12,
    color: darkTheme.textSecondary,
  },
  gridCard: {
    paddingHorizontal: 4,
    paddingBottom: 14,
  },
  gridPin: {
    marginRight: 2,
  },
  gridName: {
    fontSize: 12,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    marginTop: 7,
    lineHeight: 16,
  },
  gridSub: {
    fontSize: 11,
    color: darkTheme.textSecondary,
    marginTop: 2,
  },
  // Modal
  modalRoot: {
    flex: 1,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 36,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#555',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
    marginBottom: 6,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 15,
  },
  sheetLabel: {
    fontSize: 15,
    color: darkTheme.textPrimary,
  },
  sheetLabelIcon: {
    marginLeft: 14,
    flex: 1,
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  errorText: {
    color: '#E84040',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#282828',
    borderWidth: 1,
    borderColor: '#444',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
  },
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  createModalBox: {
    width: '100%',
    backgroundColor: darkTheme.surface,
    borderRadius: 16,
    padding: 20,
  },
  createModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 16,
  },
  createModalInput: {
    backgroundColor: darkTheme.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: darkTheme.textPrimary,
    fontSize: 15,
    marginBottom: 20,
  },
  createModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  createModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  createModalBtnCancel: {
    fontSize: 15,
    color: darkTheme.textSecondary,
  },
  disabledOpacity: {opacity: 0.4},
  createModalBtnConfirm: {
    fontSize: 15,
    color: darkTheme.accent,
    fontWeight: '600',
  },
});
