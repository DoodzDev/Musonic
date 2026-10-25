/**
 * @file FullScreenPlayer.tsx
 * @description Full-screen music player (Design v2, R4.1 to R4.3). A sheet that
 *   rises from the bottom and closes by dragging it down from its handle,
 *   header or cover; swiping the cover left / right skips to the next / previous
 *   track (same gesture as the mini player). Background made of the cover itself, extremely blurred
 *   and slightly darkened (colours keep their place), cover that
 *   shrinks on pause, title and artist with + and ♥, downloaded indicator,
 *   thin progress bar with the real audio quality, large transport glyphs
 *   without circles, and a bottom row: Lyrics · Shuffle · Repeat · Queue.
 *   Lyrics show inside the player: the cover and title fold into a compact
 *   row and the synced lyrics take the freed space (the cover column in
 *   landscape).
 *   In landscape, a 40/60 split: the cover fills its own column (order set by
 *   fullPlayerCoverSide), the other column carries everything else.
 *   Being a Modal, it hosts its own Design v2 toast.
 *   The heavy player body only mounts while the player is open; a light shell
 *   stays mounted to preload adjacent cover art.
 * @author DoodzProg
 * @version 2.4.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import CoverArt from './CoverArt';
import {
  CheckIcon,
  ChevronDownIcon,
  DotsHorizontalIcon,
  DownloadArrowIcon,
  HeartIcon,
  PlusIcon,
  TrackMagicIcon,
} from './icons';
import {getCoverArtUrl} from '../api/client';
import TrackPlayer, {useActiveTrack, usePlaybackState, State} from 'react-native-track-player';
import {useForegroundProgress} from '../hooks/useForegroundProgress';
import FastImage from '@d11/react-native-fast-image';
import {usePlayerStore} from '../store/playerStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {seekTo, skipNext, skipPrev, skipPrevForce} from '../services/playerActions';
import {useDownloadStore} from '../store/downloadStore';
import {useNavigation} from '@react-navigation/native';
import TextTicker from 'react-native-text-ticker';
import {useSettingsStore} from '../store/settingsStore';
import WaveformScrubber from './WaveformScrubber';
import QueueSheet from './QueueSheet';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import SongOptionsSheet from './SongOptionsSheet';
import SleepTimerSheet from './SleepTimerSheet';
import Toast from './Toast';
import {useT, getT} from '../i18n';
import type {SubsonicSong} from '../api/types';
import {getLyricsBySongId, type LyricsData} from '../api/endpoints/library';
import {useIsLandscape} from '../hooks/useIsLandscape';
import {useTrackQuality} from '../hooks/useTrackQuality';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import {ToastHost} from './ui/Toast';
import PressableScale from './ui/PressableScale';
import {DISMISS, SWIPE, SwipeSurface} from './ui/gestures';
import PlayerBackground, {type Point} from './player/PlayerBackground';
import PlayerProgress from './player/PlayerProgress';
import PlayerControls from './player/PlayerControls';
import PlayerActionsRow from './player/PlayerActionsRow';
import PlayerLyrics from './player/PlayerLyrics';
import Badge from './ui/Badge';
import {colors, radii} from '../theme/tokens';
import {COVER_PAUSED_SCALE, springs} from '../theme/motion';

/** Toast distance from the bottom of the full player. */
const PLAYER_TOAST_BOTTOM = 48;

const HIT = {top: 12, bottom: 12, left: 12, right: 12};

/** Fill of the round + and ♥ buttons next to the title. */
const PILL_FILL = 'rgba(255,255,255,0.14)';

/** Cover thumbnail of the title row in lyrics mode. */
const COMPACT_COVER = 48;

// ─── Downloaded indicator ─────────────────────────────────────────────────────

/** Green disc with a down arrow next to the artist: the track is on the device (G5). */
function DownloadedBadge({label}: {label: string}) {
  return (
    <View style={styles.downloadedBadge} accessible accessibilityLabel={label}>
      <DownloadArrowIcon size={12} color="#000" />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Lyrics of recently opened tracks, so reopening the player shows them instantly.
const LYRICS_CACHE_SIZE = 20;
const lyricsCache = new Map<string, NonNullable<LyricsData>>();

function rememberLyrics(trackId: string, data: NonNullable<LyricsData>) {
  lyricsCache.delete(trackId);
  lyricsCache.set(trackId, data);
  if (lyricsCache.size > LYRICS_CACHE_SIZE) {
    const oldest = lyricsCache.keys().next().value;
    if (oldest !== undefined) lyricsCache.delete(oldest);
  }
}

/**
 * Always-mounted shell. The player body (and its per-second useForegroundProgress
 * re-render) mounts only while `isFullScreenOpen` is true; the body calls
 * closeFullScreen() at the end of its close animation, which unmounts it.
 * Adjacent cover art is preloaded here so track changes stay instant even
 * while the player is closed. Audio is not prefetched: a JS fetch does not
 * warm ExoPlayer's cache and forces OctoFiesta to download ext- tracks.
 */
export default function FullScreenPlayer() {
  const isFullScreenOpen = usePlayerStore(s => s.isFullScreenOpen);
  const activeTrack = useActiveTrack();
  const activeTrackId = activeTrack?.id;

  useEffect(() => {
    if (!activeTrackId) return;
    TrackPlayer.getQueue().then(queue => {
      const idx = queue.findIndex(qt => String(qt.id) === String(activeTrackId));
      if (idx === -1) return;
      const coverUris: Array<{uri: string; priority: 'low' | 'normal' | 'high'}> = [];
      for (const adj of [queue[idx - 1], queue[idx + 1]]) {
        if (!adj) continue;
        if (adj.coverArt) coverUris.push({uri: getCoverArtUrl(String(adj.coverArt), 600), priority: FastImage.priority.high});
        if (typeof adj.artwork === 'string' && adj.artwork) coverUris.push({uri: adj.artwork, priority: FastImage.priority.high});
      }
      if (coverUris.length > 0) FastImage.preload(coverUris);
    }).catch(() => {});
  }, [activeTrackId]);

  return isFullScreenOpen ? <FullScreenPlayerContent /> : null;
}

function FullScreenPlayerContent() {
  const t = useT();
  const navigation = useNavigation<any>();
  const {width: winW, height: winH} = useWindowDimensions();
  const isLandscape = useIsLandscape();
  const fullPlayerCoverSide = useSettingsStore(s => s.fullPlayerCoverSide);
  // Portrait: big cover above the track info. Landscape: cover filling its
  // own 40% column, capped by both the column width and the available height.
  const COVER_SIZE = isLandscape
    ? Math.min(winW * 0.4 - 32, winH - 64) * 0.85
    : Math.min(winW - 48, winH * 0.4);
  // RNTP native hooks — react directly to native engine
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const isPlaying = state === State.Playing;
  const {position} = useForegroundProgress();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const isFullScreenOpen = usePlayerStore(s => s.isFullScreenOpen);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const currentPlaylistName = usePlayerStore(s => s.currentPlaylistName);
  const dominantColor = usePlayerStore(s => s.dominantColor);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const isFetchingMagic = usePlayerStore(s => s.isFetchingMagic);
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat);
  const closeFullScreen = usePlayerStore(s => s.closeFullScreen);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const storePendingLikeToast = usePlayerStore(s => s.pendingLikeToast);
  const setPendingLikeToast = usePlayerStore(s => s.setPendingLikeToast);

  const fspTrackId = currentTrack?.id ? String(currentTrack.id) : '';
  const isDownloaded = useDownloadStore(s => fspTrackId in s.downloads);
  const quality = useTrackQuality(fspTrackId || undefined);
  const currentTrackAsSong = useMemo<SubsonicSong | null>(() => {
    if (!currentTrack) return null;
    return {
      id: String(currentTrack.id),
      title: currentTrack.title ?? '',
      artist: currentTrack.artist ?? '',
      artistId: (currentTrack as any).artistId ? String((currentTrack as any).artistId) : undefined,
      album: currentTrack.album ?? '',
      albumId: (currentTrack as any).albumId ? String((currentTrack as any).albumId) : undefined,
      coverArt: currentTrack.coverArt ? String(currentTrack.coverArt) : undefined,
      duration: currentTrack.duration ?? 0,
    };
  }, [currentTrack]);
  const isLiked = fspTrackId ? (localLikeOverrides[fspTrackId] ?? likedSongIds.has(fspTrackId)) : false;
  const useWaveformScrubber = useSettingsStore(s => s.useWaveformScrubber);


  // Lyrics are fetched while the player is open — undefined=loading, null=no lyrics, data=ready.
  useEffect(() => {
    if (!currentTrack?.id) { setLyricsData(null); return; }
    const trackId = String(currentTrack.id);
    if (lyricsCache.has(trackId)) { setLyricsData(lyricsCache.get(trackId)); return; }
    setLyricsData(undefined);
    let cancelled = false;
    getLyricsBySongId(
      trackId,
      currentTrack.artist,
      currentTrack.title,
      currentTrack.duration,
    ).then(data => {
      // Only cache found lyrics: a null may come from a transient network error.
      if (data) rememberLyrics(trackId, data);
      if (!cancelled) setLyricsData(data);
    })
     .catch(() => { if (!cancelled) setLyricsData(null); });
    return () => { cancelled = true; };
  }, [currentTrack?.id, currentTrack?.artist, currentTrack?.title, currentTrack?.duration]);

  const translateY = useRef(new Animated.Value(winH)).current;
  const [visible, setVisible] = useState(false);
  const coverScale = useRef(new Animated.Value(COVER_PAUSED_SCALE)).current;
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false);
  const [songOptionsVisible, setSongOptionsVisible] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | undefined>(undefined);
  const [showLyrics, setShowLyrics] = useState(false);
  // Centre of the big cover inside the player: the blurred background is centred on it.
  // Kept while the lyrics hide the cover, so the background does not move.
  const rootRef = useRef<View>(null);
  const coverRef = useRef<View>(null);
  const [coverCenter, setCoverCenter] = useState<Point | undefined>(undefined);
  const measureCover = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    // Layout coordinates (not window ones): the sheet may still be sliding in.
    coverRef.current?.measureLayout(root, (x, y, w, h) => {
      setCoverCenter(prev => {
        const next = {x: x + w / 2, y: y + h / 2};
        return prev && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1 ? prev : next;
      });
    });
  }, []);
  const inPlaylist = fspTrackId ? savedSet.has(fspTrackId) : false;
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000);
  }, []);

  // Reactively show ext- like toasts: store sets pendingLikeToast at each step
  // (sendingToServer → stillImporting → addedToLikedNamed / sendError / removedFromLiked).
  // useEffect is the only reliable way to show these inside the Modal after a long async.
  useEffect(() => {
    if (!storePendingLikeToast) return;
    showToast(storePendingLikeToast);
    setPendingLikeToast(null);
  }, [storePendingLikeToast, showToast, setPendingLikeToast]);

  const handleToggleLike = useCallback(async () => {
    if (!fspTrackId) return;
    const wasLiked = localLikeOverrides[fspTrackId] ?? likedSongIds.has(fspTrackId);
    const isExt = fspTrackId.startsWith('ext-');
    // For ext- imports, "Sending…" is shown here AND by the useEffect above (same message, no-op duplication).
    // Unlike and all final results are handled exclusively by the useEffect.
    if (isExt && !wasLiked) showToast(getT().likes.sendingToServer);
    await toggleLike(fspTrackId, currentTrack?.title, currentTrack?.artist);
    if (!isExt) {
      const pending = usePlayerStore.getState().pendingLikeToast;
      if (pending) {
        showToast(pending);
        usePlayerStore.getState().setPendingLikeToast(null);
      } else {
        showToast(wasLiked ? getT().likes.removedFromLiked : getT().likes.addedToLiked);
      }
    }
  }, [fspTrackId, currentTrack?.title, currentTrack?.artist, localLikeOverrides, likedSongIds, toggleLike, showToast]);

  // Queue sheet
  const [queueVisible, setQueueVisible] = useState(false);
  const [sleepTimerVisible, setSleepTimerVisible] = useState(false);
  const queueSlideY = useRef(new Animated.Value(winH)).current;


  useEffect(() => {
    if (isFullScreenOpen) {
      setVisible(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [isFullScreenOpen, translateY]);

  useEffect(() => {
    Animated.spring(coverScale, {
      toValue: isPlaying ? 1 : COVER_PAUSED_SCALE,
      damping: springs.cover.damping,
      stiffness: springs.cover.stiffness,
      useNativeDriver: true,
    }).start();
  }, [isPlaying, coverScale]);

  const handleClose = useCallback(() => {
    // Close queue if open
    setQueueVisible(false);
    queueSlideY.setValue(winH);
    Animated.timing(translateY, {
      toValue: winH,
      duration: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      closeFullScreen();
    });
  }, [translateY, queueSlideY, closeFullScreen, winH]);

  // Drag the sheet down (handle, header, cover, title) to close it (ADR-010 B6).
  // Horizontal moves fail the gesture, so the progress bar and buttons keep theirs.
  const dragToClose = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(SWIPE.activation)
    .failOffsetX([-SWIPE.activation, SWIPE.activation])
    .onUpdate(e => translateY.setValue(Math.max(0, e.translationY)))
    .onEnd(e => {
      if (e.translationY > DISMISS.distance || e.velocityY > DISMISS.velocity) {
        handleClose();
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          damping: springs.sheet.damping,
          stiffness: springs.sheet.stiffness,
          overshootClamping: true,
          useNativeDriver: true,
        }).start();
      }
    }), [translateY, handleClose]);


  const onArtistPress = useCallback((name: string, id?: string) => {
    handleClose();
    setTimeout(() => {
      navigation.navigate('Main', {
        screen: 'Library',
        params: {
          screen: 'ArtistDetail',
          params: id ? {artistId: id} : {artistName: name},
        },
      } as any);
    }, 300);
  }, [handleClose, navigation]);

  const handleNavigateAlbumFromPlayer = useCallback((albumId: string) => {
    setSongOptionsVisible(false);
    handleClose();
    setTimeout(() => {
      navigation.navigate('Main', {
        screen: 'Library',
        params: {screen: 'AlbumDetail', params: {albumId}},
      } as any);
    }, 350);
  }, [handleClose, navigation]);

  const openQueue = useCallback(() => {
    setQueueVisible(true);
    queueSlideY.setValue(winH);
    Animated.timing(queueSlideY, {
      toValue: 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [queueSlideY, winH]);

  const closeQueue = useCallback(() => {
    Animated.timing(queueSlideY, {
      toValue: winH,
      duration: 250,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setQueueVisible(false));
  }, [queueSlideY, winH]);

  const toggleLyrics = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowLyrics(v => !v);
  }, []);

  if (!currentTrack) return null;

  const dur = currentTrack.duration ?? 1;
  const lyricsAvailable = !!lyricsData && lyricsData.lines.length > 0;

  // ── Shared pieces reused by both the portrait and landscape layouts below,
  // so the orientation branching only changes JSX arrangement, not logic. ──
  const chevronBtn = (
    <TouchableOpacity onPress={handleClose} hitSlop={HIT} accessibilityRole="button" accessibilityLabel={t.fullScreenPlayer.close}>
      <ChevronDownIcon />
    </TouchableOpacity>
  );

  const dotsBtn = (
    <TouchableOpacity hitSlop={HIT} onPress={() => setSongOptionsVisible(true)} accessibilityRole="button" accessibilityLabel={t.fullScreenPlayer.options}>
      <DotsHorizontalIcon size={24} />
    </TouchableOpacity>
  );

  const handleNode = <View style={styles.handle} />;

  const magicBadgeNode = (currentTrack as any).isMagic ? (
    <View style={styles.magicBadge}>
      <TrackMagicIcon size={22} />
    </View>
  ) : null;

  const titleNode = (
    <TextTicker
      style={showLyrics ? styles.trackTitleCompact : isLandscape ? styles.trackTitleLandscape : styles.trackTitle}
      duration={8000}
      loop
      bounce={false}
      repeatSpacer={50}
      marqueeDelay={2000}>
      {currentTrack.title}
    </TextTicker>
  );

  const artistNameNode = (
    <View style={styles.artistRow}>
      <Text style={[showLyrics ? styles.trackArtistCompact : isLandscape ? styles.trackArtistLandscape : styles.trackArtist, styles.artistText]} numberOfLines={1}>
        {(currentTrack.artist ?? '')
          .split(/,\s+|\s+feat\.?\s+|\s+ft\.?\s+/i)
          .map((name, i) => (
            <React.Fragment key={i}>
              {i > 0 && ', '}
              <Text
                onPress={() => onArtistPress(name.trim(), i === 0 ? currentTrack.artistId : undefined)}
                suppressHighlighting>
                {name.trim()}
              </Text>
            </React.Fragment>
          ))}
      </Text>
      {isDownloaded && <DownloadedBadge label={t.fullScreenPlayer.downloaded} />}
    </View>
  );

  const infoActionsNode = (
    <View style={styles.infoActions}>
      <PressableScale
        onPress={() => setPlaylistSheetOpen(true)}
        style={styles.pillBtn}
        accessibilityLabel={t.fullScreenPlayer.addToPlaylist}>
        {inPlaylist
          ? <CheckIcon size={18} color="#FFFFFF" strokeWidth={2.6} />
          : <PlusIcon size={18} color="#FFFFFF" strokeWidth={2.6} />}
      </PressableScale>
      <PressableScale
        onPress={handleToggleLike}
        disabled={pendingLikes.has(fspTrackId)}
        style={styles.pillBtn}
        accessibilityLabel={isLiked ? t.fullScreenPlayer.unlike : t.fullScreenPlayer.like}
        accessibilityState={{selected: isLiked, busy: pendingLikes.has(fspTrackId)}}>
        {pendingLikes.has(fspTrackId)
          ? <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          : <HeartIcon size={19} color={isLiked ? colors.accent : '#FFFFFF'} filled={isLiked} />}
      </PressableScale>
    </View>
  );

  // Swipe the cover left / right for the next / previous track, like the mini player.
  const coverNode = (
    <View ref={coverRef} onLayout={measureCover} style={{width: COVER_SIZE, height: COVER_SIZE}}>
      <SwipeSurface onSwipeLeft={skipNext} onSwipeRight={skipPrevForce}>
        <Animated.View style={[styles.coverWrapper, {transform: [{scale: coverScale}]}]}>
          <CoverArt id={currentTrack.coverArt} size={COVER_SIZE} borderRadius={radii.tile} />
        </Animated.View>
      </SwipeSurface>
    </View>
  );

  const progressNode = useWaveformScrubber ? (
    <View>
      <WaveformScrubber
        trackId={currentTrack.id}
        duration={dur}
        currentTime={position}
        onSeek={seekTo}
      />
      {quality ? <View style={styles.waveformBadge}><Badge kind="quality" label={quality} size="small" /></View> : null}
    </View>
  ) : (
    <PlayerProgress position={position} duration={dur} quality={quality} onSeek={seekTo} />
  );

  const controlsNode = (
    <PlayerControls
      isPlaying={isPlaying}
      onTogglePlay={togglePlay}
      onPrev={skipPrev}
      onNext={skipNext}
      compact={isLandscape}
    />
  );

  const actionsNode = (
    <PlayerActionsRow
      lyricsAvailable={lyricsAvailable}
      lyricsActive={showLyrics}
      onLyrics={toggleLyrics}
      shuffleMode={shuffleMode}
      isFetchingMagic={isFetchingMagic}
      onShuffle={toggleShuffle}
      repeatMode={repeatMode}
      onRepeat={cycleRepeat}
      onQueue={openQueue}
    />
  );

  const lyricsNode = <PlayerLyrics lyrics={lyricsData} onSeek={seekTo} compact={isLandscape} />;

  // In lyrics mode the cover folds into a small thumbnail at the start of the title row.
  const infoNode = (
    <View style={[styles.infoRow, showLyrics && styles.infoRowCompact]}>
      {showLyrics && (
        <CoverArt id={currentTrack.coverArt} size={COMPACT_COVER} borderRadius={radii.cover} />
      )}
      <View style={styles.infoText}>
        {magicBadgeNode}
        {titleNode}
        {artistNameNode}
      </View>
      {infoActionsNode}
    </View>
  );

  const landscapeContent = (
    <View style={[styles.landscapeContentCol, showLyrics && styles.landscapeContentColLyrics]}>
      {infoNode}
      <View>
        {progressNode}
        {controlsNode}
      </View>
      {actionsNode}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      // Back closes the top layer: the queue when it is open, else the player.
      onRequestClose={queueVisible ? closeQueue : handleClose}>
      {/* A Modal is a separate native root: gestures inside it (queue sheet swipe-down) need their own root view. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <Animated.View
        ref={rootRef}
        collapsable={false}
        style={[StyleSheet.absoluteFill, {transform: [{translateY}]}]}>

        <PlayerBackground
          coverArtId={currentTrack.coverArt ? String(currentTrack.coverArt) : undefined}
          tint={dominantColor}
          center={coverCenter}
        />

        {isLandscape ? (
          <SafeAreaView style={styles.safeAreaLandscape} edges={['top', 'bottom', 'left', 'right']}>
            <GestureDetector gesture={dragToClose}>
              <View style={styles.headerLandscape}>
                {chevronBtn}
                {dotsBtn}
              </View>
            </GestureDetector>

            <View style={styles.bodyLandscape}>
              {fullPlayerCoverSide === 'right' && landscapeContent}
              {showLyrics ? (
                <View style={styles.landscapeLyricsCol}>{lyricsNode}</View>
              ) : (
                <GestureDetector gesture={dragToClose}>
                  <View style={styles.landscapeCoverCol}>{coverNode}</View>
                </GestureDetector>
              )}
              {fullPlayerCoverSide !== 'right' && landscapeContent}
            </View>
          </SafeAreaView>
        ) : (
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>

            {/* ── Handle, header, cover and title: drag down to close.
                Lyrics mode: the cover folds into the title row, the lyrics fill the middle. ── */}
            <GestureDetector gesture={dragToClose}>
              <View>
                {handleNode}
                <View style={styles.header}>
                  {chevronBtn}
                  <View style={styles.headerCenter}>
                    <Text style={styles.headerSub} numberOfLines={1}>{t.playlistDetail.contextLabel}</Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {currentPlaylistName || currentTrack.album || t.library.title}
                    </Text>
                  </View>
                  {dotsBtn}
                </View>

                {!showLyrics && (
                  <View style={[styles.coverSection, {height: COVER_SIZE}]}>
                    {coverNode}
                  </View>
                )}

                {infoNode}
              </View>
            </GestureDetector>

            {showLyrics && <View style={styles.lyricsSection}>{lyricsNode}</View>}

            <View style={styles.progressSection}>{progressNode}</View>
            <View style={styles.controlsSection}>{controlsNode}</View>

            {!showLyrics && <View style={styles.flex} />}

            {actionsNode}

          </SafeAreaView>
        )}

        {/* ── Queue Sheet ── */}
        <QueueSheet
          visible={queueVisible}
          onClose={closeQueue}
          slideY={queueSlideY}
        />

        <AddToPlaylistSheet
          visible={playlistSheetOpen}
          onClose={() => setPlaylistSheetOpen(false)}
          trackId={currentTrack?.id != null ? String(currentTrack.id) : undefined}
          trackTitle={currentTrack?.title}
          onToast={showToast}
        />

        <Toast visible={toastVisible} message={toastMessage} />

        <SongOptionsSheet
          visible={songOptionsVisible}
          onClose={() => setSongOptionsVisible(false)}
          track={currentTrackAsSong}
          onToast={showToast}
          onNavigateAlbum={handleNavigateAlbumFromPlayer}
          onNavigateArtist={(id, name) => { setSongOptionsVisible(false); onArtistPress(name, id); }}
          onSleepTimer={() => { setSongOptionsVisible(false); setSleepTimerVisible(true); }}
        />

        <SleepTimerSheet visible={sleepTimerVisible} onClose={() => setSleepTimerVisible(false)} />

      </Animated.View>

      {/* A Modal covers the app's toast host: toasts need their own host here. */}
      <ToastHost bottom={PLAYER_TOAST_BOTTOM} />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {flex: 1},
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },

  // Handle + header
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
    marginTop: 1,
  },

  // Cover
  coverSection: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrapper: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 24},
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 20,
    borderRadius: radii.tile,
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
  },
  infoRowCompact: {marginTop: 12},
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  infoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 12,
  },
  pillBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PILL_FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  magicBadge: {
    position: 'absolute',
    top: -8,
    left: 0,
  },
  trackTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.4,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  artistText: {flexShrink: 1},
  trackArtist: {
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.4,
    color: 'rgba(255,255,255,0.65)',
  },
  trackTitleCompact: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  trackArtistCompact: {
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.65)',
  },
  lyricsSection: {
    flex: 1,
    marginTop: 8,
  },
  downloadedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress + controls
  progressSection: {marginTop: 18},
  controlsSection: {marginTop: 10},
  waveformBadge: {
    alignItems: 'center',
    marginTop: 4,
  },

  // ── Landscape: a cover column (no competing content, so it can fill the
  // whole column height) and a content column carrying title, progress,
  // controls and the bottom row, distributed top-to-bottom.
  safeAreaLandscape: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    height: 40,
  },
  bodyLandscape: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  landscapeCoverCol: {
    flex: 0.4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  landscapeLyricsCol: {
    flex: 0.6,
    paddingHorizontal: 16,
  },
  landscapeContentColLyrics: {flex: 0.4},
  landscapeContentCol: {
    flex: 0.6,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  trackTitleLandscape: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.4,
  },
  trackArtistLandscape: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.65)',
  },
});
