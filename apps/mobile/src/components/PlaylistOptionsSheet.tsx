/**
 * @file PlaylistOptionsSheet.tsx
 * @description Bottom sheet with playlist-level actions: add all to queue,
 *   add all to another playlist, pin/unpin, rename, edit cover, and delete.
 *   "Add to queue" goes through the playback engine when it drives the player.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef} from 'react';
import {
  Alert,
  useWindowDimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing, runOnJS} from 'react-native-reanimated';
import {Gesture, GestureDetector, GestureHandlerRootView, ScrollView} from 'react-native-gesture-handler';
import CoverArt from './CoverArt';
import {darkTheme} from '../theme';
import {getPlaylist, deletePlaylist} from '../api/endpoints/playlists';
import {getStreamUrl, getCoverArtUrl} from '../api/client';
import {playbackEngine} from '../services/playback/engine';
import type {Track} from '../store/playerStore';
import {useT, getT} from '../i18n';
import {DownloadIcon, DragHandleIcon, ImageIcon, PencilIcon, PinIcon, PlaylistAddIcon, QueueAddIcon, TrashIcon} from './icons';

const SHEET_MAX_WIDTH = 560;
const SHEET_MAX_HEIGHT_RATIO = 0.9;

const ICON_COLOR = '#B3B3B3';

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaylistInfo = {
  id: string;
  name: string;
  coverArt?: string;
  songCount: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  playlist: PlaylistInfo | null;
  isPinned: boolean;
  onTogglePin: () => void;
  onToast: (message: string) => void;
  onDeleted?: () => void;
  onStartEdit?: () => void;
  onOpenInfo?: () => void;
  onOpenCover?: () => void;
  onAddAll?: () => void;
  onDownload?: () => void;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlaylistOptionsSheet({
  visible,
  onClose,
  playlist,
  isPinned,
  onTogglePin,
  onToast,
  onDeleted,
  onStartEdit,
  onOpenInfo,
  onOpenCover,
  onAddAll,
  onDownload,
}: Props) {
  const t = useT();
  // Measured on every render so the hidden sheet stays off-screen after rotation.
  const {width: winW, height: SH} = useWindowDimensions();
  // Cap the height (content scrolls) and, in landscape, keep the sheet at a readable width.
  const sideInset = winW > SH ? Math.max(0, (winW - SHEET_MAX_WIDTH) / 2) : 0;
  const sheetLayout = {maxHeight: SH * SHEET_MAX_HEIGHT_RATIO, left: sideInset, right: sideInset};
  const translateY = useSharedValue(SH);
  const overlayOpacity = useSharedValue(0);

  const lastPlaylist = useRef(playlist);
  if (playlist) lastPlaylist.current = playlist;
  const p = lastPlaylist.current;

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
    if (!p) return;
    onClose();
    try {
      const {songs} = await getPlaylist(p.id);
      const tracks = songs.map(s => ({
        id: String(s.id),
        url: getStreamUrl(String(s.id)),
        title: s.title,
        artist: s.artist,
        artwork: getCoverArtUrl(s.coverArt || s.id, 300),
        coverArt: s.coverArt,
        album: s.album,
        duration: s.duration,
      }));
      await playbackEngine.playNext(tracks as Track[]);
      onToast(getT().playlistOptions.queuedToast(tracks.length));
    } catch {
      onToast(getT().playlistOptions.queueError);
    }
  }, [p, onClose, onToast]);

  const handlePin = useCallback(() => {
    onTogglePin();
    onClose();
    onToast(isPinned ? getT().playlistOptions.unpinnedToast : getT().playlistOptions.pinnedToast);
  }, [onTogglePin, onClose, onToast, isPinned]);

  const handleDelete = useCallback(() => {
    if (!p) return;
    Alert.alert(
      getT().playlistOptions.deleteTitle,
      getT().playlistOptions.deleteMessage(p.name),
      [
        {text: getT().playlistOptions.cancelButton, style: 'cancel'},
        {
          text: getT().playlistOptions.deleteConfirm,
          style: 'destructive',
          onPress: async () => {
            onClose();
            try {
              await deletePlaylist(p.id);
              onDeleted?.();
              onToast(getT().playlistOptions.deletedToast);
            } catch {
              onToast(getT().playlistOptions.deleteError);
            }
          },
        },
      ],
    );
  }, [p, onClose, onDeleted, onToast]);

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
              {p && (
                <View style={styles.header}>
                  <CoverArt id={p.coverArt} size={48} borderRadius={4} playlistId={p.id} />
                  <View style={styles.headerText}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.headerSub} numberOfLines={1}>
                      {t.playlistOptions.byYou} • {t.playlistOptions.trackCount(p.songCount)}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.divider} />

              {onStartEdit && (
                <ActionRow icon={<DragHandleIcon size={24} color={ICON_COLOR} />} label={t.playlistOptions.editPlaylist} onPress={() => { onClose(); onStartEdit(); }} />
              )}
              {onOpenInfo && (
                <ActionRow icon={<PencilIcon color={ICON_COLOR} strokeWidth={1.7} />} label={t.playlistOptions.nameAndInfo} onPress={() => { onClose(); onOpenInfo(); }} />
              )}
              {onOpenCover && (
                <ActionRow icon={<ImageIcon color={ICON_COLOR} />} label={t.playlistOptions.editCover} onPress={() => { onClose(); onOpenCover(); }} />
              )}
              <ActionRow icon={<QueueAddIcon color={ICON_COLOR} />} label={t.playlistOptions.addToQueue} onPress={handleAddToQueue} />
              <ActionRow icon={<DownloadIcon size={24} color={ICON_COLOR} />} label={t.playlistOptions.download} onPress={() => { onClose(); onDownload ? onDownload() : onToast(t.playlistOptions.comingSoon); }} />
              {onAddAll && (
                <ActionRow icon={<PlaylistAddIcon color={ICON_COLOR} />} label={t.playlistOptions.addAllToPlaylist} onPress={() => { onClose(); onAddAll(); }} />
              )}
              <ActionRow
                icon={<PinIcon color={isPinned ? darkTheme.accent : ICON_COLOR} />}
                label={isPinned ? t.playlistOptions.unpin : t.playlistOptions.pin}
                onPress={handlePin}
                accent={isPinned}
              />
              <ActionRow
                icon={<TrashIcon color="#E84040" />}
                label={t.playlistOptions.delete}
                onPress={handleDelete}
              />

              <View style={styles.bottomPad} />
            </ScrollView>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>

    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {backgroundColor: '#000'},
  disabled: {opacity: 0.4},
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
