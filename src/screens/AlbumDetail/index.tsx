/**
 * @file index.tsx
 * @description Album detail screen. Shows cover art, track listing, artist info,
 *   and playback controls for a specific album. Supports shuffle, star/unstar,
 *   animated parallax header, and a compact title (album, artist avatar +
 *   name) that fades into the fixed top bar once the header scrolls away.
 *   Playback goes through the playback engine (playFromList).
 * @author DoodzProg
 * @version 1.3.0
 * @license MIT
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  useWindowDimensions,
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useHeaderTopInset} from '../../hooks/useHeaderTopInset';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Circle, Path} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import {darkTheme} from '../../theme';
import CoverArt from '../../components/CoverArt';
import {showToast} from '../../components/Toast';
import HeartIcon from '../../components/icons/HeartIcon';
import ShuffleIcon from '../../components/icons/ShuffleIcon';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AlbumOptionsSheet from '../../components/AlbumOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {useActiveTrack} from 'react-native-track-player';
import {playFromList} from '../../services/playback/launchers';
import {playbackEngine} from '../../services/playback/engine';
import {usePlayerStore} from '../../store/playerStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {colorFromId} from '../../utils/colorUtils';
import ImageColors from 'react-native-image-colors';
import type {SubsonicSong} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';
import type {Track} from '../../store/playerStore';
import {subsonicGet, getCoverArtUrl, getStreamUrl} from '../../api/client';
import {getArtistImage} from '../../api/deezer';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useT, getT} from '../../i18n';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import DotsHorizontalIcon from '../../components/icons/DotsHorizontalIcon';
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon';
import DownloadIcon from '../../components/icons/DownloadIcon';
import DownloadStatusIcon from '../../components/icons/DownloadStatusIcon';
import PlusCircleIconComponent from '../../components/icons/PlusCircleIcon';
import {useDownloadStore} from '../../store/downloadStore';
import {useDockInset} from '../../navigation/dockLayout';

// Based on the screen's shortest side so the cover keeps the same size in both orientations.
const {width: _W, height: _H} = Dimensions.get('window');
const COVER_SIZE = Math.min(Math.min(_W, _H) - 80, 260);
const TOP_BAR_H = 52;
// Landscape header cover — small framed thumbnail, not the huge portrait hero.
// Frame follows the nested-radius rule: outer radius (14) = inner cover
// radius (10) + the frame's own padding (4).
const LANDSCAPE_COVER_SIZE = 100;
const LANDSCAPE_COVER_RADIUS = 10;

// ─── Color Extraction ────────────────────────────────────────────────────────
function darkenHex(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return '#3D1F0F';
  const darken = (v: number) => Math.round(parseInt(c.slice(v, v + 2), 16) * 0.55)
    .toString(16).padStart(2, '0');
  return `#${darken(0)}${darken(2)}${darken(4)}`;
}

function useAlbumColor(coverArtId?: string): string {
  const [color, setColor] = useState(() => coverArtId ? colorFromId(coverArtId) : '#3D1F0F');
  useEffect(() => {
    if (!coverArtId) return;
    let cancelled = false;
    let url: string;
    try { url = getCoverArtUrl(coverArtId, 200); } catch { return; }
    ImageColors.getColors(url, {fallback: colorFromId(coverArtId), cache: true})
      .then(result => {
        if (cancelled) return;
        let raw = colorFromId(coverArtId);
        if (result.platform === 'android') {
          raw = (result as any).dominant ?? (result as any).vibrant ?? (result as any).average ?? raw;
        } else if (result.platform === 'ios') {
          raw = (result as any).background ?? (result as any).primary ?? raw;
        }
        setColor(darkenHex(raw));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [coverArtId]);
  return color;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function CheckCircleGreen({size = 24}: {size?: number}) {
  return (<Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9.5} stroke="#1ED760" strokeWidth={1.6} fill="rgba(30,215,96,0.12)" /><Path d="M7.5 12 L10.5 15 L16.5 9" stroke="#1ED760" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>);
}

// ─── Song Row ─────────────────────────────────────────────────────────────────
type SongRowProps = {
  song: SubsonicSong;
  isActive: boolean;
  index: number;
  onPress: () => void;
  onMore: () => void;
  onAddToPlaylist: () => void;
  onDownloadPress: () => void;
};

function SongRow({song, isActive, index, onPress, onMore, onAddToPlaylist, onDownloadPress}: SongRowProps) {
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const id = String(song.id);
  const isLiked = localLikeOverrides[id] !== undefined ? localLikeOverrides[id] : likedSongIds.has(id);
  const isInPlaylist = savedSet.has(id);
  const isDownloaded = useDownloadStore(s => id in s.downloads);

  const handleDownloadPress = () => {
    if (isDownloaded) {
      const d = getT();
      Alert.alert(
        d.downloads.deleteSongTitle,
        d.downloads.deleteSongMessage(song.title),
        [
          {text: d.downloads.cancelButton, style: 'cancel'},
          {
            text: d.downloads.deleteConfirm,
            style: 'destructive',
            onPress: () => useDownloadStore.getState().deleteDownload(id),
          },
        ],
      );
    } else {
      onDownloadPress();
    }
  };

  return (
    <TouchableOpacity style={styles.songRow} activeOpacity={0.7} onPress={onPress} onLongPress={onMore} delayLongPress={400}>
      <View style={styles.songIndexWrap}>
        <Text style={[styles.songIndex, isActive && {color: darkTheme.accent}]}>{index}</Text>
      </View>
      <View style={styles.songInfo}>
        <Text style={[styles.songTitle, isActive && {color: darkTheme.accent}]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <View style={styles.songActions}>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 10, right: 6}}
          onPress={() => toggleLike(id, song.title, song.artist)}
          disabled={pendingLikes.has(id)}>
          {pendingLikes.has(id)
            ? <ActivityIndicator size="small" color={darkTheme.accent} style={styles.likeSpinner} />
            : <HeartIcon size={20} color={isLiked ? darkTheme.accent : '#444'} filled={isLiked} />}
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
          onPress={onAddToPlaylist}>
          {isInPlaylist
            ? <CheckCircleGreen size={20} />
            : <PlusCircleIconComponent size={20} color="#444" />}
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
          onPress={handleDownloadPress}>
          <DownloadStatusIcon trackId={id} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.songDots}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          onPress={onMore}>
          <DotsVerticalIcon />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── List Header ──────────────────────────────────────────────────────────────
function AlbumHeader({
  topBarH, coverArtId, albumName, artistName, artistImageUrl, year,
  isShuffled: _isShuffled, shuffleMode, isStarred, isStarPending, loadingAlbum, coverScale, coverTranslateY,
  onPlay, onShuffle, onToggleStar, onArtistPress, onMorePress, onDownload, onHeaderLayout,
}: any) {
  const t = useT();
  const isLandscape = useIsLandscape();
  const [imageError, setImageError] = useState(false);

  const artistRow = (
    <TouchableOpacity style={styles.metaRow} onPress={onArtistPress} activeOpacity={0.7}>
      <View style={styles.artistAvatar}>
        {artistImageUrl && !imageError ? (
          <Image source={{uri: artistImageUrl}} style={styles.artistAvatarImg} onError={() => setImageError(true)} />
        ) : (
          <Text style={styles.artistAvatarText}>
            {artistName ? artistName.charAt(0).toUpperCase() : '?'}
          </Text>
        )}
      </View>
      <Text style={styles.metaArtist} numberOfLines={1}>{artistName || t.artistDetail.unknownArtist}</Text>
    </TouchableOpacity>
  );

  const metaActionButtons = (
    <View style={styles.actionsLeft}>
      <TouchableOpacity style={styles.actionBtn} onPress={onToggleStar} activeOpacity={0.7} disabled={isStarPending}>
        {isStarPending ? (
          <ActivityIndicator size="small" color={darkTheme.accent} />
        ) : isStarred ? (
          <CheckCircleGreen size={26} />
        ) : (
          <PlusCircleIconComponent size={26} />
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onDownload}>
        <DownloadIcon size={22} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} onPress={onMorePress} activeOpacity={0.7}>
        <DotsHorizontalIcon size={22} />
      </TouchableOpacity>
    </View>
  );

  const playbackActionButtons = (
    <View style={styles.actionsRight}>
      <TouchableOpacity style={styles.actionBtn} onPress={onShuffle} activeOpacity={0.7}>
        <ShuffleIcon size={24} mode={shuffleMode} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.playBtn} onPress={onPlay} activeOpacity={0.85}>
        {loadingAlbum
          ? <ActivityIndicator color="#000" size="small" />
          : <PlayIcon size={28} color="#000" />}
      </TouchableOpacity>
    </View>
  );

  const actionButtons = (
    <>
      {metaActionButtons}
      {playbackActionButtons}
    </>
  );

  // Landscape: compact row (title/actions left, small framed cover right) —
  // visible immediately, instead of a huge cover you have to scroll past.
  if (isLandscape) {
    return (
      <View onLayout={e => onHeaderLayout?.(e.nativeEvent.layout.height)}>
        <View style={{height: topBarH + 16}} />
        <View style={styles.landscapeAlbumRow}>
          <View style={styles.landscapeAlbumInfo}>
            <Text style={styles.albumName} numberOfLines={2}>{albumName || '…'}</Text>
            {artistRow}
            <Text style={styles.metaSub}>Album • {year || t.albumDetail.unknownYear}</Text>
            <View style={styles.landscapeActionsRow}>{metaActionButtons}</View>
          </View>
          <View style={styles.landscapeCoverCol}>
            <View style={styles.landscapeCoverFrame}>
              {coverArtId ? (
                <CoverArt id={coverArtId} size={LANDSCAPE_COVER_SIZE} borderRadius={LANDSCAPE_COVER_RADIUS} />
              ) : (
                <View style={[styles.coverPlaceholder, styles.landscapeCover]} />
              )}
            </View>
            {playbackActionButtons}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View>
      {/* Wrapped together so the parent can measure exactly when this block
          has scrolled behind the fixed top bar, to fade in the compact title. */}
      <View onLayout={e => onHeaderLayout?.(e.nativeEvent.layout.height)}>
        <View style={{height: topBarH + 16}} />
        <View style={styles.coverWrap}>
          <Animated.View style={[styles.coverShadow, {transform: [{scale: coverScale}, {translateY: coverTranslateY}]}]}>
            {coverArtId ? (
              <CoverArt id={coverArtId} size={COVER_SIZE} borderRadius={8} />
            ) : (
              <View style={styles.coverPlaceholder} />
            )}
          </Animated.View>
        </View>

        <View style={styles.meta}>
          <Text style={styles.albumName} numberOfLines={2}>{albumName || '…'}</Text>
          {artistRow}
          <Text style={styles.metaSub}>Album • {year || t.albumDetail.unknownYear}</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>{actionButtons}</View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
type RouteT = RouteProp<LibraryStackParams, 'AlbumDetail'>;

export default function AlbumDetailScreen() {
  const dockInset = useDockInset();
  const topInset = useHeaderTopInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const {height: winH} = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams, 'AlbumDetail'>>();
  const route = useRoute<RouteT>();
  const {albumId} = route.params;

  const [albumName, setAlbumName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [artistId, setArtistId] = useState<string | undefined>();
  const [artistImageUrl, setArtistImageUrl] = useState<string | undefined>();
  const [year, setYear] = useState<string | number>('');
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [coverArtId, setCoverArtId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [isStarPending, setIsStarPending] = useState(false);

  const [selectedSong, setSelectedSong] = useState<SubsonicSong | null>(null);
  const [songOptsVisible, setSongOptsVisible] = useState(false);
  const [albumOptsVisible, setAlbumOptsVisible] = useState(false);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SubsonicSong | null>(null);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);

  const activeTrack = useActiveTrack();
  const currentTrackId = activeTrack?.id ? String(activeTrack.id) : null;
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);

  const dominantColor = useAlbumColor(coverArtId);
  const topBarH = topInset + TOP_BAR_H;

  const scrollY = useRef(new Animated.Value(0)).current;
  const coverScale = scrollY.interpolate({ inputRange: [0, COVER_SIZE], outputRange: [1, 0.55], extrapolate: 'clamp' });
  const coverTranslateY = scrollY.interpolate({ inputRange: [0, COVER_SIZE], outputRange: [0, COVER_SIZE * 0.2], extrapolate: 'clamp' });

  // Height of the cover+title block above the action row, measured via
  // onLayout in AlbumHeader. Once it has scrolled behind the fixed top bar
  // (scrollY > headerTopHeight - topBarH), the compact title fades in.
  const [headerTopHeight, setHeaderTopHeight] = useState(420);
  const compactFadeEnd = Math.max(1, headerTopHeight - topBarH);
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, compactFadeEnd - 40), compactFadeEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    subsonicGet<any>('getAlbum.view', { id: albumId })
      .then(res => {
        const album = res.album || {};
        setAlbumName(album.name);
        setArtistName(album.artist);
        setArtistId(album.artistId ? String(album.artistId) : undefined);
        setYear(album.year);
        setCoverArtId(album.coverArt);
        setSongs(album.song || []);
        setIsStarred(!!album.starred);
        if (album.artist) {
          getArtistImage(album.artist)
            .then(url => { if (url) setArtistImageUrl(url); })
            .catch(() => {});
        }
      })
      .catch(e => console.warn('getAlbum error', e))
      .finally(() => setLoading(false));
  }, [albumId]);

  const handleToggleStar = useCallback(async () => {
    if (isStarPending) return;

    // Unstar: for ext- albums, only possible once we already have a resolved
    // Navidrome id (star.view/unstar.view need a real album id either way).
    if (isStarred) {
      const nativeId = albumId.startsWith('ext-')
        ? usePlayerStore.getState().localImportedIds[albumId]
        : albumId;
      setIsStarred(false);
      try {
        if (nativeId) await subsonicGet('unstar.view', {albumId: nativeId});
        showToast(getT().albumDetail.removedFromLibrary);
      } catch {
        setIsStarred(true);
      }
      return;
    }

    if (!albumId.startsWith('ext-')) {
      // Native Navidrome album — always fully indexed, simple path.
      setIsStarred(true);
      try {
        await subsonicGet('star.view', {albumId});
        showToast(getT().albumDetail.addedToLibrary);
      } catch {
        setIsStarred(false);
      }
      return;
    }

    // ext-deezer-album-*: fast path if this album was already resolved
    // to a real Navidrome id earlier this session.
    const cachedId = usePlayerStore.getState().localImportedIds[albumId];
    if (cachedId) {
      setIsStarred(true);
      try {
        await subsonicGet('star.view', {albumId: cachedId});
        showToast(getT().albumDetail.addedToLibrary);
        return;
      } catch {
        setIsStarred(false);
        // Stale cache — fall through to a full re-import below.
      }
    }

    // Full import: OctoFiesta only fully registers the album server-side once
    // its tracks have been streamed/scanned. Trigger every unindexed track,
    // then poll search3.view for the resulting native album (same stream+poll
    // pattern already used for like/playlist-add on ext- tracks).
    setIsStarPending(true);
    showToast(getT().albumDetail.importingAlbum);

    songs.forEach(s => {
      const id = String(s.id);
      if (id.startsWith('ext-')) {
        fetch(getStreamUrl(id), {headers: {Range: 'bytes=0-8192'}})
          .then(res => res.arrayBuffer())
          .catch(() => {});
      }
    });

    let navidromeAlbumId: string | null = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise<void>(r => setTimeout(r, 3000));
      if (attempt === 10) showToast(getT().albumDetail.stillImportingAlbum);
      try {
        const res = await subsonicGet<any>('search3.view', {
          query: albumName,
          songCount: 0,
          albumCount: 5,
          artistCount: 0,
        });
        const albums: any[] = res.searchResult3?.album ?? [];
        const match = albums.find(a => {
          const id = String(a.id);
          return !id.startsWith('ext-') && a.name === albumName && (!artistName || a.artist === artistName);
        });
        if (match) { navidromeAlbumId = String(match.id); break; }
      } catch { /* keep polling */ }
    }

    setIsStarPending(false);

    if (!navidromeAlbumId) {
      showToast(getT().albumDetail.importError);
      return;
    }

    const resolvedId = navidromeAlbumId;
    usePlayerStore.setState(s => ({localImportedIds: {...s.localImportedIds, [albumId]: resolvedId}}));
    try {
      await subsonicGet('star.view', {albumId: resolvedId});
      setIsStarred(true);
      showToast(getT().albumDetail.addedToLibrary);
    } catch {
      showToast(getT().albumDetail.importError);
    }
  }, [isStarred, isStarPending, albumId, albumName, artistName, songs]);

  const albumTracks = useCallback((): Track[] => songs.map((s: any) => ({
      id: s.id,
      title: s.title || getT().home.unknownTitle,
      artist: s.artist || getT().artistDetail.unknownArtist,
      artistId: s.artistId,
      album: s.album || albumName || getT().albumDetail.unknownAlbum,
      duration: s.duration || 0,
      coverArt: s.coverArt || coverArtId || s.id,
      streamUrl: getStreamUrl(s.id),
      url: getStreamUrl(s.id),
      artwork: getCoverArtUrl(s.coverArt || coverArtId || s.id, 300),
  })), [songs, albumName, coverArtId]);

  const albumSource = useMemo(() => ({type: 'album' as const, id: albumId, name: albumName}), [albumId, albumName]);

  const handlePlay = useCallback(async () => {
    if (!songs.length) return;
    setLoadingAlbum(true);
    try {
      // The engine applies shuffle (albums too, A7) and offline itself.
      await playFromList(albumSource, albumTracks());
    } catch (e) {
      console.warn('play error', e);
    } finally {
      setLoadingAlbum(false);
    }
  }, [songs, albumSource, albumTracks]);

  const handlePlayTrack = useCallback(async (startIndex: number) => {
    if (!songs.length) return;
    await playFromList(albumSource, albumTracks(), startIndex);
  }, [songs, albumSource, albumTracks]);

  const handleSongMore = useCallback((song: SubsonicSong) => {
    setSelectedSong(song);
    setSongOptsVisible(true);
  }, []);

  const handleArtistPress = useCallback(() => {
    if (artistId || artistName) {
      navigation.navigate('ArtistDetail', {artistId, artistName});
    }
  }, [navigation, artistId, artistName]);

  const handleAlbumAddToQueue = useCallback(async () => {
    if (!songs.length) return;
    try {
      await playbackEngine.playNext(albumTracks());
      showToast(getT().playlistOptions.queuedToast(songs.length));
    } catch {
      showToast(getT().playlistOptions.queueError);
    }
  }, [songs, albumTracks]);

  const renderItem = useCallback(({item, index}: {item: SubsonicSong, index: number}) => (
    <SongRow
      song={item}
      isActive={currentTrackId === item.id}
      index={index + 1}
      onPress={() => handlePlayTrack(index)}
      onMore={() => handleSongMore(item)}
      onAddToPlaylist={() => { setAddToPlaylistSong(item); setAddToPlaylistVisible(true); }}
      onDownloadPress={() => useDownloadStore.getState().enqueueTrack(item)}
    />
  ), [currentTrackId, handlePlayTrack, handleSongMore]);

  const trackIds = useMemo(() => songs.map(s => String(s.id)), [songs]);

  const listHeader = useMemo(() => (
    <AlbumHeader
      topBarH={topBarH} coverArtId={coverArtId} albumName={albumName} artistName={artistName}
      artistImageUrl={artistImageUrl} year={year}
      isShuffled={isShuffled} shuffleMode={shuffleMode} isStarred={isStarred} isStarPending={isStarPending} loadingAlbum={loadingAlbum}
      coverScale={coverScale} coverTranslateY={coverTranslateY}
      onPlay={handlePlay} onShuffle={toggleShuffle} onToggleStar={handleToggleStar}
      onArtistPress={handleArtistPress} onMorePress={() => setAlbumOptsVisible(true)}
      onDownload={() => {
        useDownloadStore.getState().enqueueBatch(songs);
        showToast(getT().songOptions.downloadQueued);
      }}
      onHeaderLayout={setHeaderTopHeight}
    />
  ), [topBarH, coverArtId, albumName, artistName, artistImageUrl, year, isShuffled, shuffleMode, isStarred, isStarPending, loadingAlbum, coverScale, coverTranslateY, handlePlay, toggleShuffle, handleToggleStar, handleArtistPress, songs]);

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={[dominantColor, darkTheme.background]} locations={[0, 0.62]} style={[styles.bgGradient, {height: winH * 0.62}]} />

      {loading ? (
        <View style={[styles.center, {paddingTop: topBarH}]}><ActivityIndicator size="large" color={darkTheme.accent} /></View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, {paddingBottom: dockInset}]}
          onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: false})}
          scrollEventThrottle={16}
        />
      )}

      <View style={[styles.topBar, {paddingTop: topInset}, landscapePadding]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBg, {opacity: compactTitleOpacity}]} pointerEvents="none" />
        <View style={styles.topBarInner}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <BackArrowIcon size={24} />
          </TouchableOpacity>
          <Animated.View style={[styles.compactTitleRow, {opacity: compactTitleOpacity}]} pointerEvents="none">
            <Text style={styles.compactAlbumName} numberOfLines={1}>{albumName}</Text>
            <Text style={styles.compactAlbumLabel} numberOfLines={1}>Album</Text>
            {artistImageUrl ? (
              <Image source={{uri: artistImageUrl}} style={styles.compactArtistAvatar} />
            ) : (
              <View style={styles.compactArtistAvatarPlaceholder} />
            )}
            <Text style={styles.compactArtistName} numberOfLines={1}>{artistName}</Text>
          </Animated.View>
        </View>
      </View>

      <SongOptionsSheet
        visible={songOptsVisible}
        onClose={() => setSongOptsVisible(false)}
        track={selectedSong}
        onToast={showToast}
        onNavigateAlbum={(id) => navigation.navigate('AlbumDetail', {albumId: id})}
        onNavigateArtist={(id, name) => {
          navigation.navigate('ArtistDetail', {artistId: id, artistName: name});
        }}
      />

      <AlbumOptionsSheet
        visible={albumOptsVisible}
        onClose={() => setAlbumOptsVisible(false)}
        albumName={albumName}
        coverArtId={coverArtId}
        isStarred={isStarred}
        onToggleStar={handleToggleStar}
        onGoToArtist={artistId ? handleArtistPress : undefined}
        onAddToQueue={handleAlbumAddToQueue}
        trackIds={trackIds}
        onToast={showToast}
      />

      <AddToPlaylistSheet
        visible={addToPlaylistVisible}
        onClose={() => setAddToPlaylistVisible(false)}
        trackId={addToPlaylistSong ? String(addToPlaylistSong.id) : undefined}
        trackTitle={addToPlaylistSong?.title}
        onToast={showToast}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  likeSpinner: {width: 20, height: 20},
  coverPlaceholder: {width: COVER_SIZE, height: COVER_SIZE, backgroundColor: '#333', borderRadius: 8},
  artistAvatarText: {color: '#fff', fontSize: 10, fontWeight: '700'},
  artistAvatarImg: {width: 24, height: 24, borderRadius: 12},
  root: { flex: 1, backgroundColor: darkTheme.background },
  bgGradient: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  topBarBg: { backgroundColor: darkTheme.background },
  topBarInner: { flexDirection: 'row', alignItems: 'center', height: TOP_BAR_H, paddingHorizontal: 12 },
  backBtn: { padding: 6 },
  compactTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 6, gap: 6, overflow: 'hidden' },
  compactAlbumName: { color: '#fff', fontSize: 15, fontWeight: '800', maxWidth: '42%' },
  compactAlbumLabel: { color: '#999', fontSize: 11, fontWeight: '600' },
  compactArtistAvatar: { width: 16, height: 16, borderRadius: 8 },
  compactArtistAvatarPlaceholder: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#555' },
  compactArtistName: { color: '#bbb', fontSize: 12, fontWeight: '600', maxWidth: '28%' },
  listContent: { paddingBottom: 150 },
  landscapeAlbumRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, gap: 16, marginBottom: 24 },
  landscapeAlbumInfo: { flex: 1 },
  landscapeActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  landscapeCoverCol: { alignItems: 'flex-end', gap: 10 },
  landscapeCoverFrame: {
    width: LANDSCAPE_COVER_SIZE + 8, height: LANDSCAPE_COVER_SIZE + 8,
    borderRadius: LANDSCAPE_COVER_RADIUS + 4, padding: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  landscapeCover: { width: LANDSCAPE_COVER_SIZE, height: LANDSCAPE_COVER_SIZE, borderRadius: LANDSCAPE_COVER_RADIUS },
  coverWrap: { alignItems: 'center', paddingHorizontal: 40, marginBottom: 22 },
  coverShadow: { shadowColor: '#000', shadowOffset: {width: 0, height: 14}, shadowOpacity: 0.75, shadowRadius: 22, elevation: 18 },
  meta: { paddingHorizontal: 16, marginBottom: 6 },
  albumName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  artistAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  metaArtist: { fontSize: 16, fontWeight: '700', color: '#fff' },
  metaSub: { fontSize: 13, color: '#aaa' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 10, marginBottom: 14 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionsRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  actionBtn: { padding: 10 },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: darkTheme.accent, alignItems: 'center', justifyContent: 'center' },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 10, paddingVertical: 12, gap: 8 },
  songIndexWrap: { width: 16, alignItems: 'center' },
  songIndex: { color: '#888', fontSize: 14, fontWeight: '600' },
  songInfo: { flex: 1 },
  songTitle: { fontSize: 16, fontWeight: '500', color: '#fff' },
  songArtist: { fontSize: 13, color: '#aaa', marginTop: 3 },
  songActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  songDots: { paddingVertical: 8, paddingLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
