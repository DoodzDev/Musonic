/**
 * @file SongOptionsSheet.tsx
 * @description Bottom sheet for per-track actions: like/unlike, manage playlist
 *   membership, remove from current playlist, add to queue, go to album, go to
 *   artist. Preserves last non-null track during the close animation. "Add to
 *   queue" goes through the playback engine when it drives the player.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  useWindowDimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing, runOnJS} from 'react-native-reanimated';
import {Gesture, GestureDetector, GestureHandlerRootView, ScrollView} from 'react-native-gesture-handler';
import Svg, {Circle, Path} from 'react-native-svg';
import CheckCircleGreenIcon from './icons/CheckCircleGreenIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';
import PersonIcon from './icons/PersonIcon';
import QueueAddIcon from './icons/QueueAddIcon';
import TrackPlayer from 'react-native-track-player';
import CoverArt from './CoverArt';
import HeartIcon from './icons/HeartIcon';
import DownloadIcon from './icons/DownloadIcon';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import {darkTheme} from '../theme';
import {updatePlaylist} from '../api/endpoints/playlists';
import {getStreamUrl, getCoverArtUrl} from '../api/client';
import {syncUpcomingFromRNTP} from '../services/playerActions';
import {useDownloadStore} from '../store/downloadStore';
import {activeEngine, usePlayerStore, type Track} from '../store/playerStore';
import {usePlaylistCacheStore, fetchAndCachePlaylistSongs} from '../store/playlistCacheStore';
import {useT, getT} from '../i18n';
import type {SubsonicSong} from '../api/types';

const SHEET_MAX_WIDTH = 560;
const SHEET_MAX_HEIGHT_RATIO = 0.9;

const ICON_COLOR = '#B3B3B3';

// ─── Icons ────────────────────────────────────────────────────────────────────

function MinusCircleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={ICON_COLOR} strokeWidth={1.7} fill="none" />
      <Path d="M7 12 H17" stroke={ICON_COLOR} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function DiscIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={ICON_COLOR} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={3} stroke={ICON_COLOR} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={1} fill={ICON_COLOR} />
    </Svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  track: SubsonicSong | null;
  playlistId?: string;
  trackIndex?: number;
  onToast: (message: string) => void;
  onRemoved?: () => void;
  onNavigateAlbum?: (albumId: string) => void;
  onNavigateArtist?: (artistId: string | undefined, artistName: string) => void;
};

// ─── Action Row ───────────────────────────────────────────────────────────────

function ActionRow({
  icon,
  label,
  onPress,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowLabel, accent && {color: darkTheme.accent}]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SongOptionsSheet({
  visible,
  onClose,
  track,
  playlistId,
  trackIndex,
  onToast,
  onRemoved,
  onNavigateAlbum,
  onNavigateArtist,
}: Props) {
  const t = useT();
  // Measured on every render so the hidden sheet stays off-screen after rotation.
  const {width: winW, height: SH} = useWindowDimensions();
  // Cap the height (content scrolls) and, in landscape, keep the sheet at a readable width.
  const sideInset = winW > SH ? Math.max(0, (winW - SHEET_MAX_WIDTH) / 2) : 0;
  const sheetLayout = {maxHeight: SH * SHEET_MAX_HEIGHT_RATIO, left: sideInset, right: sideInset};
  const translateY = useSharedValue(SH);
  const overlayOpacity = useSharedValue(0);
  const [addPlaylistVisible, setAddPlaylistVisible] = useState(false);

  // Preserve last non-null track so the header stays visible during close animation
  const lastTrack = useRef(track);
  if (track) lastTrack.current = track;
  const tr = lastTrack.current;

  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const trackId = tr ? String(tr.id) : null;
  const isLiked = trackId
    ? (localLikeOverrides[trackId] !== undefined ? localLikeOverrides[trackId] : likedSongIds.has(trackId))
    : false;
  const isInPlaylist = trackId ? savedSet.has(trackId) : false;

  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: translateY.value}]}));
  const overlayStyle = useAnimatedStyle(() => ({opacity: overlayOpacity.value}));

  const handleGesture = Gesture.Pan()
    .activeOffsetY([10, Infinity])
    .onUpdate(e => {
      'worklet';
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      'worklet';
      if (e.translationY > 50 || e.velocityY > 300) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, {damping: 20, stiffness: 200});
      }
    });

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {duration: 300, easing: Easing.out(Easing.cubic)});
      overlayOpacity.value = withTiming(0.7, {duration: 200});
    } else {
      translateY.value = withTiming(SH, {duration: 250, easing: Easing.in(Easing.cubic)});
      overlayOpacity.value = withTiming(0, {duration: 180});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, SH]);

  const handleAddToQueue = useCallback(async () => {
    if (!tr) return;
    const rnTrack = {
      id: String(tr.id),
      url: getStreamUrl(String(tr.id)),
      title: tr.title,
      artist: tr.artist,
      artwork: getCoverArtUrl(tr.coverArt || tr.id, 300),
      coverArt: tr.coverArt,
      album: tr.album,
      duration: tr.duration,
    };
    try {
      const engine = activeEngine();
      if (engine) {
        await engine.playNext([rnTrack as Track]);
      } else {
        const idx = await TrackPlayer.getActiveTrackIndex();
        await TrackPlayer.add(rnTrack, idx != null ? idx + 1 : undefined);
        await syncUpcomingFromRNTP();
      }
      onToast(getT().songOptions.addedToQueue);
    } catch {
      onToast(getT().songOptions.addError);
    }
    onClose();
  }, [tr, onToast, onClose]);

  const handleRemoveFromPlaylist = useCallback(async () => {
    if (!playlistId || trackIndex == null) return;
    onClose();
    try {
      await updatePlaylist(playlistId, undefined, undefined, [trackIndex]);
      onToast(getT().songOptions.removedFromPlaylist);
      onRemoved?.();
      fetchAndCachePlaylistSongs();
    } catch {
      onToast(getT().songOptions.removeError);
    }
  }, [playlistId, trackIndex, onClose, onToast, onRemoved]);

  const handleToggleLike = useCallback(async () => {
    if (!trackId) return;
    onClose();
    const ok = await toggleLike(trackId, tr?.title, tr?.artist);
    if (ok) onToast(isLiked ? getT().likes.removedFromLiked : getT().likes.addedToLiked);
  }, [trackId, tr?.title, tr?.artist, onClose, toggleLike, isLiked, onToast]);

  const handleGoToAlbum = useCallback(() => {
    onClose();
    if (tr?.albumId) onNavigateAlbum?.(tr.albumId);
  }, [tr, onClose, onNavigateAlbum]);

  const handleGoToArtist = useCallback(() => {
    onClose();
    if (tr) onNavigateArtist?.(tr.artistId, tr.artist);
  }, [tr, onClose, onNavigateArtist]);

  const handleDownload = useCallback(() => {
    if (!tr) return;
    onClose();
    useDownloadStore.getState().enqueueTrack(tr);
    onToast(getT().songOptions.downloadQueued);
  }, [tr, onClose, onToast]);

  return (
    <>
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
            pointerEvents="none"
          />
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

          <Animated.View style={[styles.sheet, sheetLayout, sheetStyle]}>
            <GestureDetector gesture={handleGesture}>
              <View style={styles.handleWrap}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>
            <ScrollView bounces={false}>

              {/* Header */}
              {tr && (
                <View style={styles.header}>
                  <CoverArt id={tr.coverArt} size={48} borderRadius={4} />
                  <View style={styles.headerText}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{tr.title}</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>
                      {tr.artist}{tr.album ? ` • ${tr.album}` : ''}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.divider} />

              {/* Actions */}
              <ActionRow
                icon={isLiked
                  ? <HeartIcon size={22} color={darkTheme.accent} filled />
                  : <HeartIcon size={22} color={ICON_COLOR} />}
                label={isLiked ? t.songOptions.removeFromLiked : t.songOptions.addToLiked}
                onPress={handleToggleLike}
              />
              <ActionRow
                icon={isInPlaylist ? <CheckCircleGreenIcon /> : <PlusCircleIcon color={ICON_COLOR} />}
                label={isInPlaylist ? t.songOptions.manageInPlaylists : t.songOptions.addToPlaylist}
                onPress={() => setAddPlaylistVisible(true)}
              />
              {playlistId != null && (
                <ActionRow
                  icon={<MinusCircleIcon />}
                  label={t.songOptions.removeFromPlaylist}
                  onPress={handleRemoveFromPlaylist}
                />
              )}
              <ActionRow
                icon={<QueueAddIcon />}
                label={t.songOptions.addToQueue}
                onPress={handleAddToQueue}
              />
              {tr && !String(tr.id).startsWith('ext-') && (
                <ActionRow
                  icon={<DownloadIcon size={22} color={ICON_COLOR} />}
                  label={t.songOptions.download}
                  onPress={handleDownload}
                />
              )}
              {tr?.albumId && onNavigateAlbum && (
                <ActionRow
                  icon={<DiscIcon />}
                  label={t.songOptions.goToAlbum}
                  onPress={handleGoToAlbum}
                />
              )}
              <ActionRow
                icon={<PersonIcon color={ICON_COLOR} />}
                label={t.songOptions.goToArtist}
                onPress={handleGoToArtist}
              />

              <View style={styles.bottomPad} />
            </ScrollView>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>

      <AddToPlaylistSheet
        visible={addPlaylistVisible}
        onClose={() => setAddPlaylistVisible(false)}
        trackId={tr?.id}
        trackTitle={tr?.title}
        onToast={onToast}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {backgroundColor: '#000'},
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#535353',
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSub: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#282828',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: '#fff',
    marginLeft: 16,
  },
  bottomPad: {
    height: 24,
  },
});
