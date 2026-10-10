/**
 * @file MiniPlayer.tsx
 * @description Sticky mini player shown at the bottom of main screens in
 *   portrait (swipe-left/right to skip, tap to open the full-screen player),
 *   or as a compact tile attached to the nav sidebar in landscape.
 * @author DoodzProg
 * @version 1.0.5
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useRef, useState} from 'react';
import {ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import Svg, {Circle, Path} from 'react-native-svg';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon';
import {useActiveTrack, usePlaybackState, useProgress, State} from 'react-native-track-player';
import CoverArt from './CoverArt';
import HeartIcon from './icons/HeartIcon';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import {showToast} from './Toast';
import TextTicker from 'react-native-text-ticker';
import {usePlayerStore} from '../store/playerStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {skipNext, skipPrevForce} from '../services/playerActions';
import {blendWithBlack} from '../utils/colorUtils';
import {darkTheme} from '../theme';
import {useT} from '../i18n';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useIsLandscape} from '../hooks/useIsLandscape';
import {useSettingsStore} from '../store/settingsStore';
import {SIDEBAR_WIDTH} from '../navigation/shellConstants';

const TAB_BAR_HEIGHT = 60;

function CheckCircleGreen() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Circle cx={13} cy={13} r={12} fill="#1ED760" />
      <Path
        d="M7.5 13.5 L11 17 L18.5 9.5"
        stroke="#000"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function PlusCircleOutline() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Circle
        cx={13}
        cy={13}
        r={11.5}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={1.5}
        fill="none"
      />
      <Path
        d="M13 8 L13 18 M8 13 L18 13"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export default function MiniPlayer() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const isLandscape = useIsLandscape();
  const navBarPosition = useSettingsStore(s => s.navBarPosition);
  // RNTP native hooks — react directly to native engine
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const {position} = useProgress();
  const isPlaying = state === State.Playing;

  // UI-only store state
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const dominantColor = usePlayerStore(s => s.dominantColor);
  const isMiniPlayerVisible = usePlayerStore(s => s.isMiniPlayerVisible);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const openFullScreen = usePlayerStore(s => s.openFullScreen);

  const trackId = currentTrack?.id ? String(currentTrack.id) : '';
  const isLiked = trackId ? (localLikeOverrides[trackId] ?? likedSongIds.has(trackId)) : false;
  const inPlaylist = trackId ? savedSet.has(trackId) : false;

  const [sheetOpen, setSheetOpen] = useState(false);
  const coverSlide = useRef(new Animated.Value(0)).current;

  const handleToggleLike = useCallback(async () => {
    if (!trackId) return;
    const wasLiked = localLikeOverrides[trackId] ?? likedSongIds.has(trackId);
    const isExt = trackId.startsWith('ext-');
    if (isExt && !wasLiked) showToast(t.likes.sendingToServer);
    await toggleLike(trackId, currentTrack?.title, currentTrack?.artist);
    if (isExt) {
      setTimeout(() => {
        const pending = usePlayerStore.getState().pendingLikeToast;
        if (pending) { showToast(pending); usePlayerStore.getState().setPendingLikeToast(null); }
      }, 100);
    } else {
      const pending = usePlayerStore.getState().pendingLikeToast;
      if (pending) {
        showToast(pending);
        usePlayerStore.getState().setPendingLikeToast(null);
      } else {
        showToast(wasLiked ? t.likes.removedFromLiked : t.likes.addedToLiked);
      }
    }
  }, [trackId, localLikeOverrides, likedSongIds, toggleLike, t, currentTrack?.title, currentTrack?.artist]);

  const handleMiniSwipe = (direction: 'next' | 'prev') => {
    const exitX = direction === 'next' ? -52 : 52;
    const enterX = direction === 'next' ? 52 : -52;
    Animated.timing(coverSlide, {
      toValue: exitX,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'next') skipNext();
      else skipPrevForce();
      coverSlide.setValue(enterX);
      Animated.spring(coverSlide, {
        toValue: 0,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    });
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onEnd(e => {
      'worklet';
      if (e.translationX < -50 || e.velocityX < -400) {
        runOnJS(handleMiniSwipe)('next');
      } else if (e.translationX > 50 || e.velocityX > 400) {
        runOnJS(handleMiniSwipe)('prev');
      }
    });

  if (!isMiniPlayerVisible || !currentTrack?.id) return null;

  const dur = currentTrack.duration ?? 1;
  const progressFraction = Math.min(position / dur, 1);
  const bgColor = blendWithBlack(dominantColor, 0.45);

  // Landscape: compact tile attached to the bottom of the nav sidebar (same
  // edge/width) instead of a full-width bar floating above the bottom tab bar
  // — there is no bottom tab bar in landscape to float above anymore.
  if (isLandscape) {
    return (
      <>
        <View
          style={[
            styles.landscapeContainer,
            navBarPosition === 'right' ? styles.landscapeRight : styles.landscapeLeft,
            {bottom: insets.bottom + 12},
          ]}>
          <TouchableOpacity
            style={[styles.landscapeCoverClip, {backgroundColor: bgColor}]}
            onPress={openFullScreen}
            activeOpacity={0.85}>
            <CoverArt id={currentTrack.coverArt as string | undefined} size={SIDEBAR_WIDTH - 20} borderRadius={14} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.landscapePlayBtn}
            onPress={togglePlay}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} color="#fff" />}
          </TouchableOpacity>
        </View>

        <AddToPlaylistSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          trackId={currentTrack.id}
          trackTitle={currentTrack.title ?? ''}
          onToast={showToast}
        />
      </>
    );
  }

  return (
    <>
      <GestureDetector gesture={swipeGesture}>
      <View
        style={[
          styles.container,
          {bottom: TAB_BAR_HEIGHT + insets.bottom + 8, backgroundColor: bgColor},
        ]}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {width: `${progressFraction * 100}%`},
            ]}
          />
        </View>

        <View style={styles.inner}>
          <TouchableOpacity onPress={openFullScreen} activeOpacity={0.8}>
            <Animated.View style={{transform: [{translateX: coverSlide}]}}>
              <CoverArt id={currentTrack.coverArt as string | undefined} size={48} borderRadius={4} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.info}
            onPress={openFullScreen}
            activeOpacity={0.7}>
            {/* Scroll a long title once per track, then stop: an endless marquee keeps
                redrawing the screen and roughly doubles CPU use, even while paused. */}
            <TextTicker
              style={styles.title}
              duration={8000}
              loop={false}
              bounce={false}
              repeatSpacer={50}
              marqueeDelay={2000}>
              {currentTrack.title ?? ''}
            </TextTicker>
            <Text style={styles.artist} numberOfLines={1}>
              {currentTrack.artist ?? ''}
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleToggleLike}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              disabled={pendingLikes.has(trackId)}>
              {pendingLikes.has(trackId)
                ? <ActivityIndicator size="small" color="#fff" />
                : <HeartIcon size={22} color={isLiked ? '#E8553E' : '#fff'} filled={isLiked} />}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSheetOpen(true)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              {inPlaylist ? <CheckCircleGreen /> : <PlusCircleOutline />}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlay}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              {isPlaying ? <PauseIcon /> : <PlayIcon color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </GestureDetector>

      <AddToPlaylistSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        trackId={currentTrack.id}
        trackTitle={currentTrack.title ?? ''}
        onToast={showToast}
      />

    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 10,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 2,
    backgroundColor: darkTheme.accent,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  artist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 6,
  },
  landscapeContainer: {
    position: 'absolute',
    width: SIDEBAR_WIDTH - 20,
    aspectRatio: 1,
    zIndex: 10,
  },
  landscapeCoverClip: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  landscapeLeft: {left: 10},
  landscapeRight: {right: 10},
  landscapePlayBtn: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
});
