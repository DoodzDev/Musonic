/**
 * @file AlbumOptionsSheet.tsx
 * @description Bottom sheet with album-level actions: star/unstar, add all tracks
 *   to queue, add to playlist, and navigate to artist.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
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
import CheckCircleGreenIcon from './icons/CheckCircleGreenIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';
import DownloadIcon from './icons/DownloadIcon';
import PersonIcon from './icons/PersonIcon';
import QueueAddIcon from './icons/QueueAddIcon';
import CoverArt from './CoverArt';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import {useT, getT} from '../i18n';
import {PlaylistAddIcon} from './icons';

const SHEET_MAX_WIDTH = 560;
const SHEET_MAX_HEIGHT_RATIO = 0.9;

const ICON_COLOR = '#B3B3B3';

type Props = {
  visible: boolean;
  onClose: () => void;
  albumName: string;
  coverArtId?: string;
  isStarred: boolean;
  onToggleStar: () => void;
  onGoToArtist?: () => void;
  onAddToQueue: () => void;
  trackIds: string[];
  onToast: (msg: string) => void;
};

function ActionRow({icon, label, onPress}: {icon: React.ReactNode; label: string; onPress: () => void}) {
  return (
    <TouchableOpacity accessibilityRole="button" style={styles.row} activeOpacity={0.6} onPress={onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AlbumOptionsSheet({
  visible, onClose,
  albumName, coverArtId,
  isStarred, onToggleStar,
  onGoToArtist,
  onAddToQueue,
  trackIds,
  onToast,
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

  return (
    <>
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} pointerEvents="none" />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.ui.close} style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

          <GestureDetector gesture={handleGesture}>
            <Animated.View style={[styles.sheet, sheetLayout, sheetStyle]}>
              <View style={styles.handleWrap}>
                <View style={styles.handle} />
              </View>
              <ScrollView bounces={false}>

              <View style={styles.header}>
                <CoverArt id={coverArtId} size={48} borderRadius={4} />
                <View style={styles.headerText}>
                  <Text style={styles.headerTitle} numberOfLines={1}>{albumName}</Text>
                  <Text style={styles.headerSub} numberOfLines={1}>Album</Text>
                </View>
              </View>
              <View style={styles.divider} />

              <ActionRow
                icon={isStarred ? <CheckCircleGreenIcon /> : <PlusCircleIcon color={ICON_COLOR} />}
                label={isStarred ? t.albumDetail.removeFromLibraryAction : t.albumDetail.addToLibrary}
                onPress={() => { onClose(); onToggleStar(); }}
              />
              <ActionRow
                icon={<DownloadIcon color={ICON_COLOR} />}
                label={t.playlistOptions.download}
                onPress={() => { onClose(); onToast(getT().playlistOptions.comingSoon); }}
              />
              {onGoToArtist && (
                <ActionRow
                  icon={<PersonIcon color={ICON_COLOR} />}
                  label={t.songOptions.goToArtist}
                  onPress={() => { onClose(); onGoToArtist(); }}
                />
              )}
              <ActionRow
                icon={<QueueAddIcon />}
                label={t.songOptions.addToQueue}
                onPress={() => { onClose(); onAddToQueue(); }}
              />
              <ActionRow
                icon={<PlaylistAddIcon color={ICON_COLOR} />}
                label={t.playlistOptions.addAllToPlaylist}
                onPress={() => setAddPlaylistVisible(true)}
              />

              <View style={styles.bottomPad} />
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </Modal>

      {trackIds.length > 0 && (
        <AddToPlaylistSheet
          visible={addPlaylistVisible}
          onClose={() => { setAddPlaylistVisible(false); onClose(); }}
          trackIds={trackIds}
          onToast={onToast}
        />
      )}
    </>
  );
}

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
  handleWrap: {alignItems: 'center', paddingTop: 8, paddingBottom: 16},
  handle: {width: 32, height: 4, borderRadius: 2, backgroundColor: '#535353'},
  header: {flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, alignItems: 'center'},
  headerText: {marginLeft: 12, flex: 1},
  headerTitle: {fontSize: 16, fontWeight: 'bold', color: '#fff'},
  headerSub: {fontSize: 13, color: '#B3B3B3', marginTop: 4},
  divider: {height: 1, backgroundColor: '#282828', marginBottom: 4},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20},
  rowIcon: {width: 24, alignItems: 'center'},
  rowLabel: {fontSize: 16, fontWeight: '400', color: '#fff', marginLeft: 16},
  bottomPad: {height: 24},
});
