/**
 * @file LyricsScreen.tsx
 * @description Full-screen lyrics overlay with Spotify-style synced scrolling.
 *   Active line animates (scale + opacity). User can scroll freely; auto-recentering
 *   resumes only after the user stops scrolling. Opened from FullScreenPlayer.
 * @author DoodzProg
 * @version 1.0.2
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import ChevronDownIcon from './icons/ChevronDownIcon';
import PrevIcon from './icons/PrevIcon';
import NextIcon from './icons/NextIcon';
import RepeatIcon from './icons/RepeatIcon';
import ShuffleIcon from './icons/ShuffleIcon';
import {getCoverArtUrl} from '../api/client';
import Slider from '@react-native-community/slider';
import {useActiveTrack, usePlaybackState, useProgress, State} from 'react-native-track-player';
import {usePlayerStore} from '../store/playerStore';
import {formatTime} from '../utils/colorUtils';
import {seekTo, skipNext, skipPrev} from '../services/playerActions';
import type {LyricsData, LyricLine} from '../api/endpoints/library';
import {useT} from '../i18n';

// Top/bottom spacer so the first and last lines can scroll to the viewport centre.
const LYRICS_PAD = 230;
const HIT = {top: 14, bottom: 14, left: 14, right: 14};

// ─── Icons ────────────────────────────────────────────────────────────────────

function BigPlayIcon() {
  const S = 60;
  return (
    <View style={[styles.bigBtn, {width: S, height: S, borderRadius: S / 2}]}>
      <Svg width={S * 0.38} height={S * 0.38} viewBox="0 0 24 24" fill="#000">
        <Path d="M7.05 3.606l13.49 7.788a.7.7 0 0 1 0 1.212L7.05 20.394A.7.7 0 0 1 6 19.788V4.212a.7.7 0 0 1 1.05-.606z" />
      </Svg>
    </View>
  );
}

function BigPauseIcon() {
  const S = 60;
  return (
    <View style={[styles.bigBtn, {width: S, height: S, borderRadius: S / 2}]}>
      <Svg width={S * 0.38} height={S * 0.38} viewBox="0 0 24 24" fill="#000">
        <Path d="M5.7 3a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7H5.7zm10 0a.7.7 0 0 0-.7.7v16.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7h-2.6z" />
      </Svg>
    </View>
  );
}

// ─── Animated line item ───────────────────────────────────────────────────────
// Separated component so React.memo can skip re-renders when isActive unchanged.

type LineItemProps = {
  item: LyricLine;
  isActive: boolean;
  index: number;
  onLineLayout: (index: number, y: number) => void;
};

const AnimatedLineItem = React.memo(function AnimatedLineItem({
  item,
  isActive,
  index,
  onLineLayout,
}: LineItemProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.22)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: isActive ? 1.04 : 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: isActive ? 1 : 0.22,
        duration: 270,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, scale, opacity]);

  // onLayout.y is relative to the lyricsContent View which starts at the top
  // of the ScrollView content — correct coordinate for scrollTo({y}).
  const handleLayout = useCallback(
    (e: {nativeEvent: {layout: {y: number}}}) => {
      onLineLayout(index, e.nativeEvent.layout.y);
    },
    [index, onLineLayout],
  );

  return (
    <View
      style={[styles.lineItem, isActive && styles.lineItemActive]}
      onLayout={handleLayout}>
      <Animated.Text
        style={[
          styles.lineText,
          isActive && styles.lineTextActiveBold,
          {opacity, transform: [{scale}]},
        ]}>
        {item.value}
      </Animated.Text>
    </View>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  lyrics: LyricsData;
  coverArtId?: string;
};

export default function LyricsScreen({visible, onClose, lyrics, coverArtId}: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const isPlaying = state === State.Playing;
  const {position} = useProgress();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat);

  const scrollRef = useRef<ScrollView>(null);
  // Stores each line's y-offset within the scroll content for precise scrollTo.
  const lineYOffsets = useRef<number[]>([]);
  const containerHeight = useRef<number>(500);
  // User scroll state — auto-scroll only when user is not actively scrolling.
  const isUserScrolling = useRef(false);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveIdx = useRef(-1);

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const displayProgress = isSeeking ? seekValue : position;
  const dur = currentTrack?.duration ?? 1;

  const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
  const synced = lyrics?.synced ?? false;

  // Binary search: last line whose start timestamp ≤ current playback position.
  const activeIdx = useMemo(() => {
    if (!synced || !lines.length) return -1;
    const posMs = position * 1000;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i].start ?? 0) <= posMs) { idx = i; }
      else break;
    }
    return idx;
  }, [position, lines, synced]);

  const scrollToLine = useCallback((index: number, animated: boolean) => {
    const y = lineYOffsets.current[index];
    if (y == null) return;
    // Centre the line at ~40% from the top of the visible area.
    const target = y - containerHeight.current * 0.4;
    scrollRef.current?.scrollTo({y: Math.max(0, target), animated});
  }, []);

  // Auto-scroll when active line advances — skipped while user is scrolling.
  useEffect(() => {
    if (isUserScrolling.current || activeIdx < 0) return;
    if (activeIdx === prevActiveIdx.current) return;
    prevActiveIdx.current = activeIdx;
    scrollToLine(activeIdx, true);
  }, [activeIdx, scrollToLine]);

  // Scroll to current position when the screen becomes visible.
  useEffect(() => {
    if (!visible) { prevActiveIdx.current = -1; return; }
    const timer = setTimeout(() => {
      if (activeIdx >= 0) scrollToLine(activeIdx, false);
    }, 180);
    return () => clearTimeout(timer);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLineLayout = useCallback((index: number, y: number) => {
    lineYOffsets.current[index] = y;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    isUserScrolling.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    // If the user lifts without a flick, no momentum event follows — clear via timer.
    scrollEndTimer.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 400);
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    isUserScrolling.current = false;
  }, []);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>

      {/* Ambient background: blurred cover art (more vivid than FSP) */}
      <View style={styles.ambientBgClip}>
        {coverArtId && (
          <Image
            source={{uri: getCoverArtUrl(coverArtId, 600)}}
            style={[StyleSheet.absoluteFill, styles.ambientImg]}
            blurRadius={80}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.ambientOverlay1]} />
        <View style={[StyleSheet.absoluteFill, styles.ambientOverlay2]} />
      </View>

      <SafeAreaView style={styles.root} edges={['top']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={HIT} style={styles.closeBtn}>
            <ChevronDownIcon size={28} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentTrack?.title ?? ''}
            </Text>
            <Text style={styles.headerArtist} numberOfLines={1}>
              {currentTrack?.artist ?? ''}
            </Text>
          </View>
          {/* Mirror closeBtn width to keep title visually centred */}
          <View style={styles.closeBtn} />
        </View>

        {/* ── Lyrics ── */}
        {lines.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t.lyricsScreen.noLyrics}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onLayout={(e) => { containerHeight.current = e.nativeEvent.layout.height; }}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollEnd={onMomentumScrollEnd}>
            <View style={styles.lyricsContent}>
              {/* Spacer: lets line 0 scroll to vertical centre */}
              <View style={{height: LYRICS_PAD}} />
              {lines.map((line, i) => (
                <AnimatedLineItem
                  key={i}
                  item={line}
                  isActive={i === activeIdx}
                  index={i}
                  onLineLayout={handleLineLayout}
                />
              ))}
              <View style={{height: LYRICS_PAD}} />
            </View>
          </ScrollView>
        )}

        {/* ── Bottom Controls ── */}
        <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 4}]}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={dur}
            value={displayProgress}
            onValueChange={v => { setIsSeeking(true); setSeekValue(v); }}
            onSlidingComplete={v => { setIsSeeking(false); seekTo(v); }}
            minimumTrackTintColor="rgba(255,255,255,0.9)"
            maximumTrackTintColor="rgba(255,255,255,0.25)"
            thumbTintColor="#ffffff"
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(displayProgress)}</Text>
            <Text style={styles.timeText}>{formatTime(dur)}</Text>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity onPress={toggleShuffle} hitSlop={HIT}>
              <ShuffleIcon mode={shuffleMode} />
            </TouchableOpacity>
            <TouchableOpacity onPress={skipPrev} hitSlop={HIT}>
              <PrevIcon size={28} />
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlay}>
              {isPlaying ? <BigPauseIcon /> : <BigPlayIcon />}
            </TouchableOpacity>
            <TouchableOpacity onPress={skipNext} hitSlop={HIT}>
              <NextIcon size={28} />
            </TouchableOpacity>
            <TouchableOpacity onPress={cycleRepeat} hitSlop={HIT}>
              <RepeatIcon mode={repeatMode} />
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1},
  ambientBgClip: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0d0d0d',
    overflow: 'hidden',
  },
  ambientImg: {transform: [{scale: 1.5}]},
  // More vivid than FSP: lighter overlays let the cover hue show through
  ambientOverlay1: {backgroundColor: 'rgba(0,0,0,0.42)'},
  ambientOverlay2: {backgroundColor: 'rgba(10,10,10,0.12)'},

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    height: 68,
  },
  closeBtn: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  headerArtist: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // Lyrics
  lyricsContent: {
    paddingHorizontal: 28,
  },
  lineItem: {
    paddingVertical: 7,
  },
  lineItemActive: {
    paddingVertical: 16,
  },
  lineText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 28,
  },
  lineTextActiveBold: {
    fontWeight: '900',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
  },
  slider: {
    width: '100%',
    height: 36,
    marginHorizontal: -8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    marginBottom: 10,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  bigBtn: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

});
