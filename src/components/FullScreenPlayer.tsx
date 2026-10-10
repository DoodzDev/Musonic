/**
 * @file FullScreenPlayer.tsx
 * @description Full-screen music player. Ambient halo background (blurred cover),
 *   animated cover art, waveform scrubber, playback controls, lyrics preview,
 *   and queue access. In landscape, a StandBy-style 40/60 split: a hero cover
 *   fills its own column (order set by fullPlayerCoverSide), the other column
 *   carries header, progress, controls, and lyrics top-to-bottom.
 *   The heavy player body only mounts while the player is open; a light shell
 *   stays mounted to preload adjacent cover art.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import Slider from '@react-native-community/slider';
import CoverArt from './CoverArt';
import DotsHorizontalIcon from './icons/DotsHorizontalIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import PrevIcon from './icons/PrevIcon';
import NextIcon from './icons/NextIcon';
import RepeatIcon from './icons/RepeatIcon';
import ShuffleIcon from './icons/ShuffleIcon';
import {getCoverArtUrl} from '../api/client';
import HeartIcon from './icons/HeartIcon';
import TrackMagicIcon from './icons/TrackMagicIcon';
import TrackPlayer, {useActiveTrack, usePlaybackState, useProgress, State} from 'react-native-track-player';
import FastImage from '@d11/react-native-fast-image';
import {usePlayerStore} from '../store/playerStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {formatTime} from '../utils/colorUtils';
import {seekTo, skipNext, skipPrev} from '../services/playerActions';
import {useDownloadStore} from '../store/downloadStore';
import {useNavigation} from '@react-navigation/native';
import TextTicker from 'react-native-text-ticker';
import {useSettingsStore} from '../store/settingsStore';
import WaveformScrubber from './WaveformScrubber';
import QueueSheet from './QueueSheet';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import SongOptionsSheet from './SongOptionsSheet';
import LyricsScreen from './LyricsScreen';
import Toast from './Toast';
import {useT, getT} from '../i18n';
import type {SubsonicSong} from '../api/types';
import {getLyricsBySongId, type LyricsData} from '../api/endpoints/library';
import {useIsLandscape} from '../hooks/useIsLandscape';

const HIT = {top: 12, bottom: 12, left: 12, right: 12};

// ─── Icons ────────────────────────────────────────────────────────────────────

function BigPlayIcon({size = 64}: {size?: number}) {
  const circleStyle = {width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' as const, alignItems: 'center' as const, justifyContent: 'center' as const};
  return (
    <View style={circleStyle}>
      <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="#000">
        <Path d="M7.05 3.606l13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606z" />
      </Svg>
    </View>
  );
}

function BigPauseIcon({size = 64}: {size?: number}) {
  const circleStyle = {width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' as const, alignItems: 'center' as const, justifyContent: 'center' as const};
  return (
    <View style={circleStyle}>
      <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="#000">
        <Path d="M5.7 3a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7H5.7zm10 0a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-2.6z" />
      </Svg>
    </View>
  );
}

function QueueIcon({color = '#fff', size = 24}: {color?: string; size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="5" width="16" height="5" rx="2.5" stroke={color} strokeWidth={1.8} />
      <Path d="M4 14.5 H20 M4 19.5 H20" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function CoverDownloadIcon({trackId, size = 28}: {trackId: string; size?: number}) {
  const isDownloaded = useDownloadStore(s => trackId in s.downloads);
  const isDownloading = useDownloadStore(s => {
    const a = s.activeDownloads[trackId];
    return a != null && (a.status === 'queued' || a.status === 'downloading');
  });
  const color = isDownloaded ? '#1ED760' : '#B3B3B3';

  if (isDownloading) {
    return (
      <View style={[styles.iconCenter, {width: size, height: size}]}>
        <ActivityIndicator size="small" color="#1ED760" />
      </View>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} fill="none" />
      <Path
        d="M12 7 V14 M9 12 L12 15 L15 12"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Ambient Background ───────────────────────────────────────────────────────

function AmbientBackground({coverArtId}: {coverArtId?: string}) {
  if (!coverArtId) {
    return <View style={[StyleSheet.absoluteFill, styles.ambientBg]} />;
  }
  const imageUrl = getCoverArtUrl(coverArtId, 600);
  return (
    <View style={[StyleSheet.absoluteFill, styles.ambientBgClip]}>
      <Image
        source={{uri: imageUrl}}
        style={[StyleSheet.absoluteFill, styles.ambientImg]}
        blurRadius={90}
      />
      <View style={[StyleSheet.absoluteFill, styles.ambientOverlay1]} />
      <View style={[StyleSheet.absoluteFill, styles.ambientOverlay2]} />
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
 * Always-mounted shell. The player body (and its per-second useProgress
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
  // Portrait: big hero cover above the track info. Landscape: hero cover
  // filling its own 40% column (StandBy-style split), capped by both the
  // column width and the available height so it stays a clean square.
  // Shrunk to 85% of that cap so the play-state scale-up (see coverScale
  // below) has room to breathe without touching the screen edges.
  const COVER_SIZE = isLandscape
    ? Math.min(winW * 0.4 - 32, winH - 64) * 0.85
    : Math.min(winW - 64, winH * 0.36);
  // RNTP native hooks — react directly to native engine
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const isPlaying = state === State.Playing;
  const {position} = useProgress();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const isFullScreenOpen = usePlayerStore(s => s.isFullScreenOpen);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const currentPlaylistName = usePlayerStore(s => s.currentPlaylistName);
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
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const setShuffleMode = usePlayerStore(s => s.setShuffleMode);


  // Lyrics are fetched while the player is open — undefined=loading (hides card), null=no lyrics, data=ready.
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
  const coverScale = useRef(new Animated.Value(0.88)).current;
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [playlistSheetOpen, setPlaylistSheetOpen] = useState(false);
  const [songOptionsVisible, setSongOptionsVisible] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | undefined>(undefined);
  const [lyricsVisible, setLyricsVisible] = useState(false);
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

  const handleDownloadPress = useCallback(() => {
    if (!fspTrackId || !currentTrackAsSong) return;
    if (useDownloadStore.getState().isDownloaded(fspTrackId)) {
      const d = getT();
      Alert.alert(
        d.downloads.deleteSongTitle,
        d.downloads.deleteSongMessage(currentTrackAsSong.title),
        [
          {text: d.downloads.cancelButton, style: 'cancel'},
          {
            text: d.downloads.deleteConfirm,
            style: 'destructive',
            onPress: () => useDownloadStore.getState().deleteDownload(fspTrackId),
          },
        ],
      );
      return;
    }
    useDownloadStore.getState().enqueueTrack(currentTrackAsSong);
  }, [fspTrackId, currentTrackAsSong]);

  // Queue sheet
  const [queueVisible, setQueueVisible] = useState(false);
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
      toValue: isPlaying ? 1 : 0.88,
      friction: 6,
      tension: 80,
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

  if (!currentTrack) return null;

  const dur = currentTrack.duration ?? 1;

  // Current active lyrics line shown in the preview card.
  const lyricsPreview = (() => {
    if (!lyricsData?.lines.length) return '';
    const posMs = position * 1000;
    let idx = 0;
    if (lyricsData.synced) {
      for (let i = 0; i < lyricsData.lines.length; i++) {
        if ((lyricsData.lines[i].start ?? 0) <= posMs) { idx = i; }
        else break;
      }
    }
    return lyricsData.lines[idx].value;
  })();
  const displayProgress = isSeeking ? seekValue : position;

  // ── Shared pieces reused by both the portrait and landscape layouts below,
  // so the orientation branching only changes JSX arrangement, not logic. ──
  const chevronBtn = (
    <TouchableOpacity onPress={handleClose} hitSlop={HIT}>
      <ChevronDownIcon />
    </TouchableOpacity>
  );

  const dotsBtn = (
    <TouchableOpacity hitSlop={HIT} onPress={() => setSongOptionsVisible(true)}>
      <DotsHorizontalIcon size={24} />
    </TouchableOpacity>
  );

  const magicBadgeNode = (currentTrack as any).isMagic ? (
    <View style={styles.magicBadge}>
      <TrackMagicIcon size={22} />
    </View>
  ) : null;

  const titleNode = (
    <TextTicker
      style={isLandscape ? styles.trackTitleLandscape : styles.trackTitle}
      duration={8000}
      loop
      bounce={false}
      repeatSpacer={50}
      marqueeDelay={2000}>
      {currentTrack.title}
    </TextTicker>
  );

  const artistNameNode = (
    <Text style={isLandscape ? styles.trackArtistLandscape : styles.trackArtist} numberOfLines={1}>
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
  );

  const infoActionsNode = (
    <View style={isLandscape ? styles.infoActionsLandscape : styles.infoActions}>
      <TouchableOpacity hitSlop={HIT} onPress={openQueue}>
        <QueueIcon />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setPlaylistSheetOpen(true)}
        hitSlop={HIT}>
        <Svg width={26} height={26} viewBox="0 0 26 26">
          {inPlaylist ? (
            <>
              <Circle cx={13} cy={13} r={12} fill="#1ED760" />
              <Path d="M7.5 13.5 L11 17 L18.5 9.5" stroke="#000" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </>
          ) : (
            <>
              <Circle cx={13} cy={13} r={11.5} stroke="#B3B3B3" strokeWidth={1.5} fill="none" />
              <Path d="M13 8 L13 18 M8 13 L18 13" stroke="#B3B3B3" strokeWidth={1.8} strokeLinecap="round" fill="none" />
            </>
          )}
        </Svg>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleToggleLike} hitSlop={HIT} disabled={pendingLikes.has(fspTrackId)}>
        {pendingLikes.has(fspTrackId)
          ? <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={styles.likeSpinner} />
          : <HeartIcon size={26} color={isLiked ? '#E8553E' : 'rgba(255,255,255,0.6)'} filled={isLiked} />}
      </TouchableOpacity>
    </View>
  );

  const coverNode = (
    <View style={[isLandscape ? styles.coverCenterLandscape : styles.coverCenter, {width: COVER_SIZE, height: COVER_SIZE}]}>
      <Animated.View style={[styles.coverWrapper, {transform: [{scale: coverScale}]}]}>
        <CoverArt id={currentTrack.coverArt} size={COVER_SIZE} borderRadius={8} />
      </Animated.View>
      {!fspTrackId.startsWith('ext-') && currentTrackAsSong && (
        <TouchableOpacity
          style={styles.coverDownloadBtn}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}
          onPress={handleDownloadPress}>
          <CoverDownloadIcon trackId={fspTrackId} size={28} />
        </TouchableOpacity>
      )}
    </View>
  );

  const progressNode = useWaveformScrubber ? (
    <WaveformScrubber
      trackId={currentTrack.id}
      duration={dur}
      currentTime={displayProgress}
      onSeek={seekTo}
    />
  ) : (
    <View style={styles.sliderSection}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={dur}
        value={displayProgress}
        onValueChange={v => {
          setIsSeeking(true);
          setSeekValue(v);
        }}
        onSlidingComplete={v => {
          setIsSeeking(false);
          seekTo(v);
        }}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#FFFFFF"
      />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayProgress)}</Text>
        <Text style={styles.timeText}>{formatTime(dur)}</Text>
      </View>
    </View>
  );

  const controlsNode = (
    <View style={isLandscape ? styles.controlsLandscape : styles.controls}>
      <TouchableOpacity
        onPress={() => {
          if (isOfflineMode && shuffleMode === 'on') { setShuffleMode('off'); return; }
          toggleShuffle();
        }}
        hitSlop={HIT}
        disabled={isFetchingMagic}
        style={isFetchingMagic ? styles.dimmed : undefined}>
        {isFetchingMagic
          ? <ActivityIndicator size="small" color="#fff" />
          : <ShuffleIcon mode={shuffleMode} />}
      </TouchableOpacity>

      <TouchableOpacity onPress={skipPrev} hitSlop={HIT}>
        <PrevIcon />
      </TouchableOpacity>

      <TouchableOpacity onPress={togglePlay} style={styles.bigPlayBtn}>
        {isPlaying ? <BigPauseIcon /> : <BigPlayIcon />}
      </TouchableOpacity>

      <TouchableOpacity onPress={skipNext} hitSlop={HIT}>
        <NextIcon />
      </TouchableOpacity>

      <TouchableOpacity onPress={cycleRepeat} hitSlop={HIT}>
        <RepeatIcon mode={repeatMode} />
      </TouchableOpacity>
    </View>
  );

  const lyricsNode = (
    <TouchableOpacity
      style={isLandscape ? styles.lyricsCardLandscape : styles.lyricsCard}
      onPress={() => setLyricsVisible(true)}
      activeOpacity={lyricsData && lyricsData.lines.length > 0 ? 0.75 : 1}
      disabled={!lyricsData || lyricsData.lines.length === 0}>
      <Text style={styles.lyricsTitle}>{t.fullScreenPlayer.lyricsTitle}</Text>
      {lyricsData === undefined ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={styles.lyricsLoader} />
      ) : lyricsData === null ? (
        <Text style={styles.lyricsTextDim}>{t.lyricsScreen.noLyrics}</Text>
      ) : (
        <Text style={styles.lyricsText} numberOfLines={1}>{lyricsPreview}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <Animated.View
        style={[StyleSheet.absoluteFill, {transform: [{translateY}]}]}>

        {/* ── Ambient Halo Background ── */}
        <AmbientBackground key={currentTrack.coverArt ?? ''} coverArtId={currentTrack.coverArt} />

        {isLandscape ? (
          <SafeAreaView style={styles.safeAreaLandscape} edges={['top', 'bottom', 'left', 'right']}>
            {/* ── Header — chevron always top-left, dots always top-right,
                shared across both columns below ── */}
            <View style={styles.headerLandscape}>
              {chevronBtn}
              {dotsBtn}
            </View>

            {/* ── Body — StandBy-style split: hero cover fills its own column
                (no competing content), the other column carries everything
                else top-to-bottom. Order swappable via fullPlayerCoverSide. ── */}
            <View style={styles.bodyLandscape}>
              {fullPlayerCoverSide === 'left' ? (
                <>
                  <View style={styles.landscapeCoverCol}>{coverNode}</View>
                  <View style={styles.landscapeContentCol}>
                    <View style={styles.landscapeInnerHeader}>
                      <View style={styles.landscapeTitleBlock}>
                        {magicBadgeNode}
                        {titleNode}
                        {artistNameNode}
                      </View>
                      {infoActionsNode}
                    </View>
                    <View style={styles.landscapeMiddleGroup}>
                      {progressNode}
                      {controlsNode}
                    </View>
                    {lyricsNode}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.landscapeContentCol}>
                    <View style={styles.landscapeInnerHeader}>
                      <View style={styles.landscapeTitleBlock}>
                        {magicBadgeNode}
                        {titleNode}
                        {artistNameNode}
                      </View>
                      {infoActionsNode}
                    </View>
                    <View style={styles.landscapeMiddleGroup}>
                      {progressNode}
                      {controlsNode}
                    </View>
                    {lyricsNode}
                  </View>
                  <View style={styles.landscapeCoverCol}>{coverNode}</View>
                </>
              )}
            </View>
          </SafeAreaView>
        ) : (
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>

            {/* ── Header ── */}
            <View style={styles.header}>
              {chevronBtn}
              <View style={styles.headerCenter}>
                <Text style={styles.headerSub}>{t.playlistDetail.contextLabel}</Text>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {currentPlaylistName || currentTrack.album || t.library.title}
                </Text>
              </View>
              {dotsBtn}
            </View>

            {/* ── Cover Art ── */}
            <View style={[styles.coverSection, {height: COVER_SIZE + 24}]}>
              {coverNode}
            </View>

            {/* ── Track Info + Like ── */}
            <View style={styles.infoRow}>
              <View style={styles.infoText}>
                {magicBadgeNode}
                {titleNode}
                {artistNameNode}
              </View>
              {infoActionsNode}
            </View>

            {/* ── Progress ── */}
            {progressNode}

            {/* ── Main Controls ── */}
            {controlsNode}

            {/* ── Lyrics Peek — always visible; clickable only when lyrics are loaded ── */}
            {lyricsNode}

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
        />

        <LyricsScreen
          visible={lyricsVisible}
          onClose={() => setLyricsVisible(false)}
          lyrics={lyricsData ?? null}
          coverArtId={currentTrack?.coverArt ? String(currentTrack.coverArt) : undefined}
        />

      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  ambientBg: {backgroundColor: '#121212'},
  ambientBgClip: {backgroundColor: '#121212', overflow: 'hidden'},
  ambientImg: {transform: [{scale: 1.5}]},
  ambientOverlay1: {backgroundColor: 'rgba(0,0,0,0.55)'},
  ambientOverlay2: {backgroundColor: 'rgba(18,18,18,0.3)'},
  coverCenter: {
    position: 'relative',
  },
  coverCenterLandscape: {
    position: 'relative',
  },
  coverDownloadBtn: {
    position: 'absolute',
    bottom: -12,
    right: -12,
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
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
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },

  // Cover
  coverSection: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverWrapper: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 20},
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
    borderRadius: 8,
  },

  // Info
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    marginRight: 16,
  },
  infoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 16,
  },
  magicBadge: {
    position: 'absolute',
    top: -8,
    left: 0,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
  },

  // Slider
  sliderSection: {
    marginTop: 4,
  },
  slider: {
    width: '100%',
    height: 40,
    marginHorizontal: -8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 8,
  },
  bigPlayBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // Lyrics
  lyricsCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
  },
  lyricsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  lyricsLoader: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  lyricsText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
    lineHeight: 22,
  },
  lyricsTextDim: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 6,
    fontStyle: 'italic',
  },
  likeSpinner: {
    width: 26,
    height: 26,
  },

  // ── Landscape layout — one horizontal flow: mini cover + title/artist row,
  // StandBy-style split: a hero cover column (no competing content, so it
  // can fill the whole column height) and a content column carrying header,
  // progress, controls, and lyrics distributed top-to-bottom.
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
  landscapeContentCol: {
    flex: 0.6,
    paddingLeft: 24,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  landscapeInnerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  landscapeTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  landscapeMiddleGroup: {
    justifyContent: 'center',
  },
  trackTitleLandscape: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  trackArtistLandscape: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
  },
  infoActionsLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
    marginTop: 20,
  },
  controlsLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 6,
    marginBottom: 22,
  },
  lyricsCardLandscape: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 14,
  },

});
