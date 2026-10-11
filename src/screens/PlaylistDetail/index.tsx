/**
 * @file index.tsx
 * @description Playlist detail screen. Displays tracks in a playlist with
 *   drag-and-drop reordering, inline search, edit mode, recommended track
 *   suggestions, and full CRUD support (add, remove, rename). Play and track
 *   taps go through the playback engine (`playContext`).
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  useWindowDimensions,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useHeaderTopInset} from '../../hooks/useHeaderTopInset';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Circle, Path} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import ImageColors from 'react-native-image-colors';
import {darkTheme} from '../../theme';
import CoverArt from '../../components/CoverArt';
import {getPlaylist, replacePlaylist, updatePlaylist} from '../../api/endpoints/playlists';
import {
  getDeezerArtistId,
  getDeezerArtistTopTracks,
  enrichTracksWithAlbumType,
  type DeezerTrack,
} from '../../api/deezer';
import {playbackEngine} from '../../services/playback/engine';
import {playFromList} from '../../services/playback/launchers';
import ShuffleIcon from '../../components/icons/ShuffleIcon';
import TrackPlayer, {useActiveTrack, usePlaybackState, State} from 'react-native-track-player';
import {usePlayerStore} from '../../store/playerStore';
import {colorFromId} from '../../utils/colorUtils';
import type {SubsonicSong} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';
import {getCoverArtUrl, getStreamUrl, subsonicGet} from '../../api/client';
import type {Track, ShuffleMode} from '../../store/playerStore';
import DraggableFlatList, {ScaleDecorator} from 'react-native-draggable-flatlist';
import type {RenderItemParams} from 'react-native-draggable-flatlist';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import PlaylistOptionsSheet from '../../components/PlaylistOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import PlaylistInfoModal, {getLocalCoverUri} from '../../components/PlaylistInfoModal';
import {showToast} from '../../components/Toast';
import {useT, getT} from '../../i18n';
import {fetchAndCachePlaylistSongs, usePlaylistCacheStore} from '../../store/playlistCacheStore';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import HeartIcon from '../../components/icons/HeartIcon';
import DotsHorizontalIcon from '../../components/icons/DotsHorizontalIcon';
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon';
import DownloadIcon from '../../components/icons/DownloadIcon';
import DownloadStatusIcon from '../../components/icons/DownloadStatusIcon';
import PlusCircleIconComponent from '../../components/icons/PlusCircleIcon';
import {useDownloadStore, type DownloadedTrack} from '../../store/downloadStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useDockInset} from '../../navigation/dockLayout';

// Based on the screen's shortest side so the cover keeps the same size in both orientations.
const {width: _W, height: _H} = Dimensions.get('window');
const COVER_SIZE = Math.min(Math.min(_W, _H) - 80, 260);
const TOP_BAR_H = 52;

// ─── Vivid color extraction via react-native-image-colors ────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length !== 6) return [61, 31, 15];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn)      h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else                 h = (rn - gn) / delta + 4;
  return [((h * 60) + 360) % 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const round = (v: number) => Math.round((v + m) * 255);
  return [round(r), round(g), round(b)];
}

// Boosts saturation and raises lightness to produce vivid, flashy gradient colors
// while keeping text readable (L capped at 0.42).
function toVividColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  const finalS = Math.min(1, Math.max(0.7, s * 1.5));
  const finalL = 0.42;
  const [fr, fg, fb] = hslToRgb(h, finalS, finalL);
  const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex2(fr)}${hex2(fg)}${hex2(fb)}`;
}

function usePlaylistColor(coverArtId?: string): string {
  const [color, setColor] = useState(() =>
    coverArtId ? colorFromId(coverArtId) : '#3D1F0F',
  );
  useEffect(() => {
    if (!coverArtId) return;
    const fallback = colorFromId(coverArtId);
    let cancelled = false;
    let url: string;
    try { url = getCoverArtUrl(coverArtId, 200); } catch { return; }

    ImageColors.getColors(url, {fallback, cache: true})
      .then(result => {
        if (cancelled) return;
        let raw = fallback;
        if (result.platform === 'android') {
          raw = (result as any).vibrant
             ?? (result as any).dominant
             ?? (result as any).average
             ?? fallback;
        } else if (result.platform === 'ios') {
          raw = (result as any).primary
             ?? (result as any).background
             ?? fallback;
        }
        if (!cancelled) setColor(toVividColor(raw));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [coverArtId]);
  return color;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function SearchSmIcon({size = 18, color = '#888'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={2} fill="none" />
      <Path d="M15.5 15.5 L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PauseIcon({size = 22, color = '#000'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 4 L6 20" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M18 4 L18 20" stroke={color} strokeWidth={3.5} strokeLinecap="round" />
    </Svg>
  );
}

function FadersIcon({size = 15, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 6 L10 6 M14 6 L20 6 M11 3 L11 9"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M4 18 L8 18 M12 18 L20 18 M9 15 L9 21"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PencilIcon({size = 15, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 5 H5 C4.4 5 4 5.4 4 6 V19 C4 19.6 4.4 20 5 20 H18 C18.6 20 19 19.6 19 19 V13 M17.5 2.5 C18.3 1.7 19.7 1.7 20.5 2.5 C21.3 3.3 21.3 4.7 20.5 5.5 L12 14 L8 15 L9 11 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function MinusCircleIcon({size = 24}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill="#555" />
      <Path d="M7 12 H17" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function DragHandleIcon({size = 24, color = '#777'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8 H20 M4 12 H20 M4 16 H20" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Liked Cover ──────────────────────────────────────────────────────────────

function LikedCover({size, radius = 8}: {size: number; radius?: number}) {
  const coverStyle = {width: size, height: size, borderRadius: radius, alignItems: 'center' as const, justifyContent: 'center' as const};
  return (
    <LinearGradient
      colors={['#6B2FA0', '#1E3A8A']}
      style={coverStyle}>
      <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24">
        <Path
          d="M12 21 C12 21 3 14.5 3 8.5 C3 5.4 5.4 3 8.5 3 C10.1 3 11.5 3.8 12 5 C12.5 3.8 13.9 3 15.5 3 C18.6 3 21 5.4 21 8.5 C21 14.5 12 21 12 21 Z"
          fill="white"
        />
      </Svg>
    </LinearGradient>
  );
}

// ─── Deezer recommendation helpers ────────────────────────────────────────────

function dedupeById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

function deezerTrackToInternalTrack(t: DeezerTrack): Track {
  const sid = `ext-deezer-song-${t.id}`;
  return {
    id: sid, title: t.title, artist: t.artist.name, album: t.album.title,
    duration: t.duration, coverArt: sid,
    streamUrl: getStreamUrl(sid), url: getStreamUrl(sid),
    artwork: getCoverArtUrl(sid, 300), artistId: undefined,
  };
}

// ─── Song row ─────────────────────────────────────────────────────────────────

type SongRowProps = {
  song: SubsonicSong;
  isActive: boolean;
  onPress: () => void;
  onMorePress: () => void;
  onDownloadPress: () => void;
};

function SongRow({song, isActive, onPress, onMorePress, onDownloadPress}: SongRowProps) {
  const trackId = String(song.id);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const isDownloaded = useDownloadStore(s => trackId in s.downloads);
  const isLiked = localLikeOverrides[trackId] !== undefined
    ? localLikeOverrides[trackId]
    : likedSongIds.has(trackId);

  const handleToggleLike = useCallback(async () => {
    const wasLiked = localLikeOverrides[trackId] !== undefined
      ? localLikeOverrides[trackId]
      : likedSongIds.has(trackId);
    await toggleLike(trackId, song.title, song.artist);
    const pending = usePlayerStore.getState().pendingLikeToast;
    if (pending) {
      showToast(pending);
      usePlayerStore.getState().setPendingLikeToast(null);
    } else {
      showToast(wasLiked ? getT().likes.removedFromLiked : getT().likes.addedToLiked);
    }
  }, [trackId, localLikeOverrides, likedSongIds, toggleLike, song.title, song.artist]);

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
            onPress: () => useDownloadStore.getState().deleteDownload(trackId),
          },
        ],
      );
    } else {
      onDownloadPress();
    }
  };

  return (
    <TouchableOpacity
      style={styles.songRow}
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onMorePress}
      delayLongPress={400}>
      <CoverArt id={song.coverArt} size={44} borderRadius={4} />
      <View style={styles.songInfo}>
        <Text style={[styles.songTitle, isActive && {color: darkTheme.accent}]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <TouchableOpacity
        hitSlop={{top: 10, bottom: 10, left: 8, right: 6}}
        onPress={handleToggleLike}
        disabled={pendingLikes.has(trackId)}>
        {pendingLikes.has(trackId)
          ? <ActivityIndicator size="small" color="#E8553E" style={styles.likeSpinner} />
          : <HeartIcon size={18} color={isLiked ? '#E8553E' : '#444'} filled={isLiked} />}
      </TouchableOpacity>
      <TouchableOpacity
        hitSlop={{top: 10, bottom: 10, left: 6, right: 4}}
        onPress={handleDownloadPress}>
        <DownloadStatusIcon trackId={trackId} size={20} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.songDots}
        hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
        onPress={onMorePress}>
        <DotsVerticalIcon />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── List Header ──────────────────────────────────────────────────────────────

type HeaderProps = {
  topBarH: number;
  coverArtId?: string;
  localCoverUri?: string | null;
  playlistName: string;
  owner: string;
  songCount: number;
  totalDuration: number;
  isShuffled: boolean;
  shuffleMode: ShuffleMode;
  isThisPlaylistActive: boolean;
  isGlobalPlaying: boolean;
  loadingPlaylist: boolean;
  coverScale: Animated.AnimatedInterpolation<number>;
  coverTranslateY: Animated.AnimatedInterpolation<number>;
  query: string;
  onQueryChange: (q: string) => void;
  onPlay: () => void;
  onShuffle: () => void;
  onMorePress: () => void;
  onStartEdit: () => void;
  onOpenInfo: () => void;
  onDownload: () => void;
  onDeleteDownloads: () => void;
  allDownloaded: boolean;
};

function PlaylistHeader({
  topBarH,
  coverArtId,
  localCoverUri,
  playlistName,
  owner: _owner,
  songCount,
  totalDuration,
  isShuffled: _isShuffled,
  shuffleMode,
  isThisPlaylistActive,
  isGlobalPlaying,
  loadingPlaylist,
  coverScale,
  coverTranslateY,
  query,
  onQueryChange,
  onPlay,
  onShuffle,
  onMorePress,
  onStartEdit,
  onOpenInfo,
  onDownload,
  onDeleteDownloads,
  allDownloaded,
}: HeaderProps) {
  const t = useT();
  const showPause = isThisPlaylistActive && isGlobalPlaying;

  return (
    <View>
      <View style={{height: topBarH + 16}} />

      {/* Search bar (scrolls with content) */}
      <View style={styles.searchInHeader}>
        <SearchSmIcon size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder={t.playlistDetail.searchPlaceholder}
          placeholderTextColor="#888"
          value={query}
          onChangeText={onQueryChange}
          returnKeyType="search"
        />
      </View>

      {/* Cover with parallax */}
      <View style={styles.coverWrap}>
        <Animated.View
          style={[
            styles.coverShadow,
            {transform: [{scale: coverScale}, {translateY: coverTranslateY}]},
          ]}>
          {localCoverUri ? (
            <Image source={{uri: localCoverUri}} style={styles.coverLocalImg} />
          ) : coverArtId ? (
            <CoverArt id={coverArtId} size={COVER_SIZE} borderRadius={8} />
          ) : (
            <LikedCover size={COVER_SIZE} />
          )}
        </Animated.View>
      </View>

      {/* Title + meta */}
      <View style={styles.meta}>
        <Text style={styles.playlistName} numberOfLines={2}>
          {playlistName || '…'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaSub}>
            {t.playlistDetail.trackCount(songCount)} · {formatDuration(totalDuration)}
          </Text>
        </View>
      </View>

      {/* Context label — visible when this playlist is active */}
      {isThisPlaylistActive && (
        <Text style={styles.contextLabel}>{t.playlistDetail.contextLabel}</Text>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.7}
            onPress={allDownloaded ? onDeleteDownloads : onDownload}>
            <DownloadIcon size={22} color={allDownloaded ? '#1ED760' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onMorePress}>
            <DotsHorizontalIcon size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.actionsRight}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onShuffle}
            activeOpacity={0.7}>
            <ShuffleIcon size={24} mode={shuffleMode} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={onPlay}
            activeOpacity={0.85}>
            {loadingPlaylist ? (
              <ActivityIndicator color="#000" size="small" />
            ) : showPause ? (
              <PauseIcon size={24} color="#000" />
            ) : (
              <PlayIcon size={24} color="#000" />

            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Pills */}
      <View style={styles.pillsRow}>
        <TouchableOpacity style={styles.pillBtn} activeOpacity={0.7} onPress={onStartEdit}>
          <DragHandleIcon size={14} color="#fff" />
          <Text style={[styles.pillText, styles.pillTextIndent]}>{t.playlistDetail.pills.edit}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} activeOpacity={0.7} onPress={() => showToast(t.playlistDetail.comingSoon)}>
          <FadersIcon size={14} />
          <Text style={[styles.pillText, styles.pillTextIndent]}>{t.playlistDetail.pills.sort}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} activeOpacity={0.7} onPress={onOpenInfo}>
          <PencilIcon size={14} />
          <Text style={[styles.pillText, styles.pillTextIndent]}>{t.playlistDetail.pills.info}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── List Footer ──────────────────────────────────────────────────────────────

type FooterProps = {
  recoTracks: DeezerTrack[];
  recoLoading: boolean;
  onPressRec: (t: DeezerTrack) => void;
  onAddRec: (t: DeezerTrack) => void;
};

function PlaylistFooter({recoTracks, recoLoading, onPressRec, onAddRec}: FooterProps) {
  const t = useT();
  return (
    <View style={styles.recoSection}>
      <Text style={styles.recoTitle}>{t.playlistDetail.recommendations.title}</Text>
      <Text style={styles.recoSub}>{t.playlistDetail.recommendations.subtitle}</Text>

      {recoLoading && recoTracks.length === 0 && (
        <View style={styles.recoLoadingRow}>
          <ActivityIndicator size="small" color={darkTheme.accent} />
          <Text style={styles.recoArtist}>{t.playlistDetail.recommendations.loading}</Text>
        </View>
      )}

      {recoTracks.map(track => (
        <TouchableOpacity
          key={track.id}
          style={styles.recoRow}
          onPress={() => onPressRec(track)}
          activeOpacity={0.7}>
          <Image
            source={{uri: track.album.cover_medium}}
            style={styles.recoCoverImg}
          />
          <View style={styles.recoInfo}>
            <Text style={styles.recoName} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.recoArtist} numberOfLines={1}>
              {track.artist.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onAddRec(track)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <PlusCircleIconComponent size={26} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Edit Mode Components ─────────────────────────────────────────────────────

function EditHeader({
  topInset,
  isSaving,
  onCancel,
  onSave,
}: {
  topInset: number;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <View style={[styles.editBar, {paddingTop: topInset}]}>
      <TouchableOpacity onPress={onCancel} style={styles.editBarSide} activeOpacity={0.7}>
        <BackArrowIcon size={22} />
      </TouchableOpacity>
      <Text style={styles.editBarTitle}>{t.playlistDetail.editHeader}</Text>
      <TouchableOpacity
        onPress={onSave}
        style={[styles.editBarSide, styles.editBarRight]}
        activeOpacity={0.7}
        disabled={isSaving}>
        {isSaving ? (
          <ActivityIndicator size="small" color={darkTheme.accent} />
        ) : (
          <Text style={styles.editSaveText}>{t.playlistDetail.saveButton}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function EditSongRow({
  song,
  drag,
  isActive,
  onRemove,
}: {
  song: SubsonicSong;
  drag: () => void;
  isActive: boolean;
  onRemove: () => void;
}) {
  return (
    <ScaleDecorator>
      <View style={[styles.editRow, isActive && styles.editRowActive]}>
        <TouchableOpacity
          onPress={onRemove}
          style={styles.editMinusBtn}
          activeOpacity={0.7}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <MinusCircleIcon />
        </TouchableOpacity>
        <CoverArt id={song.coverArt} size={48} borderRadius={4} />
        <View style={styles.songInfo}>
          <Text style={styles.editSongTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={styles.editSongArtist} numberOfLines={1}>{song.artist}</Text>
        </View>
        <TouchableOpacity
          onLongPress={drag}
          delayLongPress={0}
          style={styles.dragHandle}
          activeOpacity={0.6}>
          <DragHandleIcon />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  );
}

// ─── Offline Footer ───────────────────────────────────────────────────────────

function OfflineFooter({label, tracks, onPressTrack}: {
  label: string;
  tracks: DownloadedTrack[];
  onPressTrack: (track: DownloadedTrack) => void;
}) {
  if (!tracks.length) return null;
  return (
    <View style={styles.recoSection}>
      <Text style={styles.recoTitle}>{label}</Text>
      {tracks.map(t => (
        <TouchableOpacity key={t.trackId} style={styles.recoRow} onPress={() => onPressTrack(t)} activeOpacity={0.7}>
          <CoverArt id={t.coverArt} size={44} borderRadius={4} />
          <View style={styles.recoInfo}>
            <Text style={styles.recoName} numberOfLines={1}>{t.title}</Text>
            <Text style={styles.recoArtist} numberOfLines={1}>{t.artist}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type RouteT = RouteProp<LibraryStackParams, 'PlaylistDetail'>;

/** Playlist songs as playable tracks (local files are picked at load time). */
function songsToTracks(songs: SubsonicSong[]): Track[] {
  return songs.map((s: any) => ({
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

export default function PlaylistDetailScreen() {
  const dockInset = useDockInset();
  const topInset = useHeaderTopInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const {height: winH} = useWindowDimensions();
  const navigation =
    useNavigation<NativeStackNavigationProp<LibraryStackParams, 'PlaylistDetail'>>();
  const route = useRoute<RouteT>();
  const {playlistId, autoEdit} = route.params;

  const [playlistName, setPlaylistName] = useState('');
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [coverArtId, setCoverArtId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [recoTracks, setRecoTracks] = useState<DeezerTrack[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const recoFetchedRef = useRef(false);
  const [query, setQuery] = useState('');

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editSongs, setEditSongs] = useState<SubsonicSong[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [localCoverUri, setLocalCoverUri] = useState<string | null>(() => getLocalCoverUri(playlistId));

  // Sheets & modals
  const [songOptionsTrack, setSongOptionsTrack] = useState<SubsonicSong | null>(null);
  const [songOptionsIndex, setSongOptionsIndex] = useState<number>(0);
  const [playlistOptionsVisible, setPlaylistOptionsVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalInitialView, setInfoModalInitialView] = useState<'info' | 'cover'>('info');
  const [addAllVisible, setAddAllVisible] = useState(false);
  const playbackState = usePlaybackState();
  const isGlobalPlaying = playbackState.state === State.Playing;
  const currentPlaylistId = usePlayerStore(s => s.currentPlaylistId);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const activeServerUsername = useSettingsStore(s => {
    const id = s.activeServerId;
    return s.servers.find(srv => srv.id === id)?.username ?? '';
  });
  const downloads = useDownloadStore(s => s.downloads);
  const t = useT();

  const isThisPlaylistActive = currentPlaylistId === playlistId;

  // Track the active RNTP track by ID so the highlight stays correct under shuffle.
  const activeTrack = useActiveTrack();
  const activeTrackId = activeTrack?.id ? String(activeTrack.id) : null;
  const [currentQueueIdx, setCurrentQueueIdx] = useState<number | undefined>(undefined);
  useEffect(() => {
    TrackPlayer.getActiveTrackIndex().then(setCurrentQueueIdx).catch(() => {});
  }, [activeTrackId]);

  const dominantColor = usePlaylistColor(coverArtId);
  const topBarH = topInset + TOP_BAR_H;

  // Parallax animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const coverScale = scrollY.interpolate({
    inputRange: [0, COVER_SIZE],
    outputRange: [1, 0.55],
    extrapolate: 'clamp',
  });
  const coverTranslateY = scrollY.interpolate({
    inputRange: [0, COVER_SIZE],
    outputRange: [0, COVER_SIZE * 0.2],
    extrapolate: 'clamp',
  });

  // Refresh local cover whenever info modal closes
  useEffect(() => {
    if (!infoModalVisible) {
      setLocalCoverUri(getLocalCoverUri(playlistId));
    }
  }, [infoModalVisible, playlistId]);

  useEffect(() => {
    setLoading(true);
    if (isOfflineMode) {
      const cachedPl = usePlaylistCacheStore.getState().cachedPlaylists.find(p => p.id === playlistId);
      const offlineSongs = usePlaylistCacheStore.getState().getOfflineSongs(playlistId);
      const {isDownloaded} = useDownloadStore.getState();
      setPlaylistName(cachedPl?.name ?? '');
      setOwner(cachedPl?.owner ?? activeServerUsername);
      setCoverArtId(cachedPl?.coverArt);
      setSongs(offlineSongs.filter(s => isDownloaded(String(s.id))));
      setLoading(false);
      return;
    }
    getPlaylist(playlistId)
      .then(({playlist, songs: s}) => {
        setPlaylistName(playlist.name);
        setOwner(playlist.owner ?? activeServerUsername);
        setDescription(playlist.comment ?? '');
        setCoverArtId(playlist.coverArt);
        setSongs(s);
      })
      .catch(e => console.warn('getPlaylist error', e))
      .finally(() => setLoading(false));
  }, [playlistId, isOfflineMode, activeServerUsername]);

  useEffect(() => {
    if (isOfflineMode) return;
    if (songs.length === 0 || recoFetchedRef.current) return;
    recoFetchedRef.current = true;

    const artistNames = [...new Set(songs.map(s => s.artist).filter(Boolean))].slice(0, 3);
    if (!artistNames.length) return;

    let cancelled = false;
    setRecoLoading(true);

    (async () => {
      try {
        const ids = await Promise.all(artistNames.map(n => getDeezerArtistId(n).catch(() => null)));
        const rawArrays = await Promise.all(
          ids.map(id => (id ? getDeezerArtistTopTracks(id, 15).catch(() => []) : Promise.resolve([]))),
        );
        const flat = dedupeById(rawArrays.flat()).slice(0, 30);
        const enriched = await enrichTracksWithAlbumType(flat);
        const deduped = enriched.slice(0, 30);
        if (!cancelled) setRecoTracks(deduped);
      } catch {}
      finally { if (!cancelled) setRecoLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [songs, isOfflineMode]);

  const handlePlay = useCallback(async () => {
    if (isThisPlaylistActive) {
      togglePlay();
      return;
    }
    const downloadStore = useDownloadStore.getState();
    if (isOfflineMode && !songs.some(s => downloadStore.isDownloaded(String(s.id)))) {
      showToast(getT().playlistDetail.noDownloadedSongs);
      return;
    }
    setLoadingPlaylist(true);
    try {
      // The engine applies shuffle, Magic and offline itself (ADR-009).
      await playbackEngine.playContext({
        source: {type: 'playlist', id: playlistId, name: playlistName},
        tracks: songsToTracks(songs),
      });
    } catch (e) {
      console.warn('play error', e);
    } finally {
      setLoadingPlaylist(false);
    }
  }, [isOfflineMode, songs, playlistName, isThisPlaylistActive, togglePlay, playlistId]);

  // Offline, the engine skips Magic itself (E1).
  const handleShuffle = toggleShuffle;

  // Pair each displayed song with its original index in `songs` so we can:
  // 1. Pass the exact startIndex to RNTP (correct playback position)
  // 2. Highlight only the index actually playing, not all occurrences of the same ID
  const filteredWithOrigIdx = useMemo(
    () =>
      query.length < 2
        ? songs.map((s, i) => ({s, origIdx: i}))
        : songs
            .map((s, i) => ({s, origIdx: i}))
            .filter(
              ({s}) =>
                s.title.toLowerCase().includes(query.toLowerCase()) ||
                s.artist.toLowerCase().includes(query.toLowerCase()),
            ),
    [songs, query],
  );

  const totalDuration = useMemo(
    () => songs.reduce((acc, s) => acc + (s.duration ?? 0), 0),
    [songs],
  );

  const filteredRecoTracks = useMemo(() => {
    if (!recoTracks.length) return recoTracks;
    const songKeys = new Set(songs.map(s => `${s.title}|||${s.artist}`));
    return recoTracks.filter(track => !songKeys.has(`${track.title}|||${track.artist.name}`)).slice(0, 10);
  }, [recoTracks, songs]);

  const offlineSuggestions = useMemo<DownloadedTrack[]>(() => {
    if (!isOfflineMode) return [];
    const songIdSet = new Set(songs.map(s => String(s.id)));
    return Object.values(downloads)
      .filter(d => !songIdSet.has(d.trackId))
      .slice(0, 8);
  }, [isOfflineMode, downloads, songs]);

  const handlePressOfflineTrack = useCallback((track: DownloadedTrack) => {
    playFromList({type: 'other'}, [{
      id: track.trackId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      coverArt: track.coverArt,
      streamUrl: track.localPath,
      url: track.localPath,
      artwork: track.coverArt ? getCoverArtUrl(track.coverArt, 300) : '',
    }], 0);
  }, []);

  const handlePlayTrack = useCallback(async (origIdx: number) => {
    if (!songs.length) return;
    const tracks = songsToTracks(songs);
    const tapped = tracks[origIdx];
    if (!tapped) return;
    // A9: tapping the track already playing opens the player, it does not restart.
    const current = await TrackPlayer.getActiveTrack().catch(() => undefined);
    if (current && String(current.id) === tapped.id) {
      usePlayerStore.getState().openFullScreen();
      return;
    }
    await playbackEngine.playContext({
      source: {type: 'playlist', id: playlistId, name: playlistName},
      tracks,
      startTrackId: tapped.id,
    });
  }, [songs, playlistId, playlistName]);

  const handleSongMore = useCallback((song: SubsonicSong, origIdx: number) => {
    setSongOptionsTrack(song);
    // Use the pre-computed original index directly — findIndex by ID would return the
    // first duplicate, causing removal of the wrong entry in playlists with repeated tracks.
    setSongOptionsIndex(origIdx);
  }, []);

  const handleSongRemoved = useCallback(() => {
    setSongOptionsTrack(null);
    // Reload playlist after removal
    getPlaylist(playlistId)
      .then(({playlist: pl, songs: s}) => {
        setPlaylistName(pl.name);
        setCoverArtId(pl.coverArt);
        setSongs(s);
      })
      .catch(() => {});
  }, [playlistId]);

  const handlePressRec = useCallback((track: DeezerTrack) => {
    playFromList({type: 'other'}, [deezerTrackToInternalTrack(track)], 0);
  }, []);

  const handleAddRec = useCallback(async (track: DeezerTrack) => {
    const extId = `ext-deezer-song-${track.id}`;
    const title = track.title;
    const artist = track.artist.name;
    showToast(getT().likes.sendingToServer);

    fetch(getStreamUrl(extId), {headers: {Range: 'bytes=0-8192'}})
      .then(res => res.arrayBuffer())
      .catch(() => {});

    let navidromeId: string | null = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise<void>(r => setTimeout(r, 3000));
      if (attempt === 10) showToast(getT().likes.stillImporting);
      try {
        const res = await subsonicGet<any>('search3.view', {
          query: title,
          songCount: 10,
          albumCount: 0,
          artistCount: 0,
        });
        const found: any[] = res.searchResult3?.song ?? [];
        const match = found.find(
          s => !String(s.id).startsWith('ext-') && s.title === title && s.artist === artist,
        );
        if (match) { navidromeId = String(match.id); break; }
      } catch { /* keep polling */ }
    }

    if (!navidromeId) {
      showToast(getT().likes.sendError);
      return;
    }

    try {
      await updatePlaylist(playlistId, undefined, [navidromeId]);
      const newSong: SubsonicSong = {
        id: navidromeId,
        title,
        artist,
        album: track.album.title,
        duration: track.duration,
        coverArt: navidromeId,
      };
      setSongs(prev => [...prev, newSong]);
      showToast(getT().addToPlaylist.addedTo(title, playlistName));
    } catch {
      showToast(getT().addToPlaylist.unavailableTrack);
    }
  }, [playlistId, playlistName]);

  const handleNavigateAlbum = useCallback((albumId: string) => {
    navigation.navigate('AlbumDetail', {albumId});
  }, [navigation]);

  const handleNavigateArtist = useCallback((artistId: string | undefined, artistName: string) => {
    navigation.navigate('ArtistDetail', artistId ? {artistId} : {artistName});
  }, [navigation]);

  const handleStartEdit = useCallback(() => {
    setEditSongs([...songs]);
    setIsEditing(true);
  }, [songs]);

  const autoEditDoneRef = useRef(false);
  useEffect(() => {
    if (autoEdit && !autoEditDoneRef.current && songs.length > 0 && !loading) {
      autoEditDoneRef.current = true;
      handleStartEdit();
    }
  }, [autoEdit, songs, loading, handleStartEdit]);

  const handleOpenInfo = useCallback(() => {
    setInfoModalInitialView('info');
    setInfoModalVisible(true);
  }, []);

  const handleOpenCover = useCallback(() => {
    setInfoModalInitialView('cover');
    setInfoModalVisible(true);
  }, []);

  const handleInfoSaved = useCallback((name: string, desc: string) => {
    setPlaylistName(name);
    setDescription(desc);
    showToast(getT().playlistInfo.saved);
  }, []);

  const handleInfoDeleted = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditSongs([]);
  }, []);

  const handleRemoveFromEdit = useCallback((songId: string) => {
    setEditSongs(prev => prev.filter(s => String(s.id) !== songId));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    setIsSaving(true);
    try {
      await replacePlaylist(playlistId, editSongs.map(s => String(s.id)));
      const {playlist: pl, songs: fresh} = await getPlaylist(playlistId);
      setPlaylistName(pl.name);
      setCoverArtId(pl.coverArt);
      setSongs(fresh);
      setIsEditing(false);
      setEditSongs([]);
      showToast(getT().playlistDetail.savedToast);
      fetchAndCachePlaylistSongs();
    } catch {
      showToast(getT().playlistDetail.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [editSongs, playlistId]);

  const renderItem = useCallback(
    ({item}: {item: {s: SubsonicSong; origIdx: number}}) => (
      <SongRow
        song={item.s}
        isActive={
          isThisPlaylistActive && (
            shuffleMode !== 'off'
              ? activeTrackId !== null && activeTrackId === String(item.s.id)
              : currentQueueIdx !== undefined && currentQueueIdx === item.origIdx
          )
        }
        onPress={() => handlePlayTrack(item.origIdx)}
        onMorePress={() => handleSongMore(item.s, item.origIdx)}
        onDownloadPress={() => useDownloadStore.getState().enqueueTrack(item.s)}
      />
    ),
    [isThisPlaylistActive, activeTrackId, currentQueueIdx, shuffleMode, handlePlayTrack, handleSongMore],
  );

  const listHeader = useMemo(
    () => (
      <PlaylistHeader
        topBarH={topBarH}
        coverArtId={coverArtId}
        localCoverUri={localCoverUri}
        playlistName={playlistName}
        owner={owner}
        songCount={songs.length}
        totalDuration={totalDuration}
        isShuffled={isShuffled}
        shuffleMode={shuffleMode}
        isThisPlaylistActive={isThisPlaylistActive}
        isGlobalPlaying={isGlobalPlaying}
        loadingPlaylist={loadingPlaylist}
        coverScale={coverScale}
        coverTranslateY={coverTranslateY}
        query={query}
        onQueryChange={setQuery}
        onPlay={handlePlay}
        onShuffle={handleShuffle}
        onMorePress={() => setPlaylistOptionsVisible(true)}
        onStartEdit={handleStartEdit}
        onOpenInfo={handleOpenInfo}
        allDownloaded={(() => {
          const downloadable = songs.filter(s => !String(s.id).startsWith('ext-'));
          return downloadable.length > 0 && downloadable.every(s => !!downloads[String(s.id)]);
        })()}
        onDeleteDownloads={() => {
          const d = getT();
          const downloadable = songs.filter(s => !String(s.id).startsWith('ext-') && !!downloads[String(s.id)]);
          Alert.alert(
            d.downloads.deletePlaylistTitle,
            d.downloads.deletePlaylistMessage(playlistName, downloadable.length),
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
        }}
        onDownload={() => {
          const d = getT();
          Alert.alert(
            d.library.offlineDownloadTitle,
            d.library.offlineDownloadMessage(playlistName, songs.length),
            [
              {text: d.playlistOptions.cancelButton, style: 'cancel'},
              {
                text: d.songOptions.download,
                onPress: () => {
                  useDownloadStore.getState().enqueueBatch(songs, () => {
                    showToast(getT().library.offlineDownloadComplete(playlistName));
                  });
                  showToast(d.songOptions.downloadQueued);
                },
              },
            ],
          );
        }}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      topBarH, coverArtId, localCoverUri, playlistName, owner, songs, totalDuration,
      isShuffled, shuffleMode, isThisPlaylistActive, isGlobalPlaying, loadingPlaylist,
      query, handlePlay, handleStartEdit, handleOpenInfo, isOfflineMode, downloads,
    ],
  );

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background — gradient normally, opaque when editing */}
      {isEditing ? (
        <View style={[StyleSheet.absoluteFill, styles.editBg]} />
      ) : (
        <LinearGradient
          colors={[dominantColor, darkTheme.background]}
          locations={[0, 0.72]}
          style={[styles.bgGradient, {height: winH * 0.78}]}
        />
      )}

      {/* Scrollable content */}
      {isEditing ? (
        <DraggableFlatList
          data={editSongs}
          keyExtractor={(item, index) => `${String(item.id)}-${index}`}
          renderItem={({item, drag, isActive}: RenderItemParams<SubsonicSong>) => (
            <EditSongRow
              song={item}
              drag={drag}
              isActive={isActive}
              onRemove={() => handleRemoveFromEdit(String(item.id))}
            />
          )}
          onDragEnd={({data}) => setEditSongs(data)}
          contentContainerStyle={[styles.listContent, {paddingTop: topInset + 56 + 16, paddingBottom: dockInset}]}
          showsVerticalScrollIndicator={false}
        />
      ) : loading ? (
        <View style={[styles.center, {paddingTop: topBarH}]}>
          <ActivityIndicator size="large" color={darkTheme.accent} />
        </View>
      ) : (
        <FlashList
          data={filteredWithOrigIdx}
          keyExtractor={(item) => `${String(item.s.id)}-${item.origIdx}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={
            isOfflineMode ? (
              <OfflineFooter
                label={t.playlistDetail.offlineRecoLabel}
                tracks={offlineSuggestions}
                onPressTrack={handlePressOfflineTrack}
              />
            ) : (
              <PlaylistFooter
                recoTracks={filteredRecoTracks}
                recoLoading={recoLoading}
                onPressRec={handlePressRec}
                onAddRec={handleAddRec}
              />
            )
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, {paddingBottom: dockInset}]}
          onScroll={Animated.event(
            [{nativeEvent: {contentOffset: {y: scrollY}}}],
            {useNativeDriver: false},
          )}
          scrollEventThrottle={16}
        />
      )}

      {/* Fixed top bar — back button / edit header */}
      {isEditing ? (
        <EditHeader
          topInset={topInset}
          isSaving={isSaving}
          onCancel={handleCancelEdit}
          onSave={handleSaveEdit}
        />
      ) : (
        <View style={[styles.topBar, {paddingTop: topInset}]} pointerEvents="box-none">
          <View style={styles.topBarInner}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}>
              <BackArrowIcon size={24} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <SongOptionsSheet
        visible={songOptionsTrack !== null}
        onClose={() => setSongOptionsTrack(null)}
        track={songOptionsTrack}
        playlistId={playlistId}
        trackIndex={songOptionsIndex}
        onToast={showToast}
        onRemoved={handleSongRemoved}
        onNavigateAlbum={handleNavigateAlbum}
        onNavigateArtist={handleNavigateArtist}
      />

      <PlaylistOptionsSheet
        visible={playlistOptionsVisible}
        onClose={() => setPlaylistOptionsVisible(false)}
        playlist={coverArtId !== undefined || playlistName ? {id: playlistId, name: playlistName, coverArt: coverArtId, songCount: songs.length} : null}
        isPinned={false}
        onTogglePin={() => {}}
        onToast={showToast}
        onDeleted={() => navigation.goBack()}
        onStartEdit={handleStartEdit}
        onOpenInfo={handleOpenInfo}
        onOpenCover={handleOpenCover}
        onAddAll={() => setAddAllVisible(true)}
        onDownload={() => {
          useDownloadStore.getState().enqueueBatch(songs, () => {
            showToast(getT().library.offlineDownloadComplete(playlistName));
          });
          showToast(getT().songOptions.downloadQueued);
        }}
      />

      <AddToPlaylistSheet
        visible={addAllVisible}
        onClose={() => setAddAllVisible(false)}
        trackIds={songs.map(s => String(s.id))}
        onToast={showToast}
      />


      <PlaylistInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        playlistId={playlistId}
        initialName={playlistName}
        initialDescription={description}
        coverArtId={coverArtId}
        onSaved={handleInfoSaved}
        onDeleted={handleInfoDeleted}
        initialView={infoModalInitialView}
      />

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pillTextIndent: {marginLeft: 5},
  likeSpinner: {width: 18, height: 18},
  editBarRight: {alignItems: 'flex-end'},
  root: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Fixed top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TOP_BAR_H,
    paddingHorizontal: 12,
  },
  backBtn: {
    padding: 6,
  },
  // Search inside scroll
  searchInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  // List
  listContent: {
    paddingBottom: 150,
  },
  // Header
  coverWrap: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 22,
  },
  coverShadow: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 14},
    shadowOpacity: 0.75,
    shadowRadius: 22,
    elevation: 18,
  },
  coverLocalImg: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 8,
  },
  meta: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  playlistName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaSub: {
    fontSize: 13,
    color: '#aaa',
  },
  metaDot: {
    fontSize: 13,
    color: '#555',
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: darkTheme.accent,
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 14,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
  },
  actionBtn: {
    padding: 10,
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  // Song row
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  songCoverPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: darkTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  songArtist: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 2,
  },
  songDots: {
    padding: 8,
  },
  // Recommendations
  recoSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  recoTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  recoSub: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 16,
  },
  recoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  recoCover: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: darkTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoCoverImg: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: darkTheme.surfaceAlt,
  },
  recoLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  recoInfo: {
    flex: 1,
  },
  recoName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
  },
  recoArtist: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Edit mode
  editBg: {
    backgroundColor: '#121212',
  },
  editBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  editBarSide: {
    width: 100,
    padding: 6,
  },
  editBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  editSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: darkTheme.accent,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#121212',
  },
  editRowActive: {
    backgroundColor: '#2A2A2A',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  editMinusBtn: {
    padding: 4,
  },
  editSongTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  editSongArtist: {
    fontSize: 14,
    color: '#A7A7A7',
    marginTop: 2,
  },
  dragHandle: {
    padding: 8,
  },
});
