/**
 * @file PlayerLyrics.tsx
 * @description Lyrics shown inside the full player, in place of the cover
 *   (Design v2, R4.3). Synced lyrics: the current line is white, past lines
 *   faint, upcoming ones half faint; the list follows the song, pauses while
 *   the user scrolls, and a tap on a line seeks to it. Plain lyrics are shown
 *   whole, without following. The list fades out at its top and bottom edges
 *   (gradient mask). Progress is read 4 times a second, only while the lyrics
 *   are on screen.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useProgress} from 'react-native-track-player';
import MaskedView from '@react-native-masked-view/masked-view';
import LinearGradient from 'react-native-linear-gradient';
import type {LyricLine, LyricsData} from '../../api/endpoints/library';
import {useT} from '../../i18n';

/** Progress polling while lyrics are visible (ms): smooth line changes. */
const PROGRESS_INTERVAL_MS = 250;
/** The current line settles at this share of the visible height. */
const ACTIVE_LINE_AT = 0.35;
/** After a manual scroll, following resumes after this delay (ms). */
const RESUME_FOLLOW_MS = 3000;

/** Edge fade of the list: transparent → opaque over the first 10 %, back to transparent over the last 15 %. */
const FADE_COLORS = ['transparent', '#000', '#000', 'transparent'];
const FADE_STOPS = [0, 0.1, 0.85, 1];

const OPACITY = {active: 1, past: 0.32, upcoming: 0.45, plain: 0.85} as const;
type LineState = keyof typeof OPACITY;

type LineProps = {
  line: LyricLine;
  index: number;
  state: LineState;
  big: boolean;
  onLayoutY: (index: number, y: number) => void;
  onPress?: (index: number) => void;
};

const LyricLineRow = React.memo(function LyricLineRow({line, index, state, big, onLayoutY, onPress}: LineProps) {
  const opacity = useRef(new Animated.Value(OPACITY[state])).current;

  useEffect(() => {
    Animated.timing(opacity, {toValue: OPACITY[state], duration: 300, useNativeDriver: true}).start();
  }, [state, opacity]);

  return (
    <Pressable
      onPress={onPress ? () => onPress(index) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      onLayout={e => onLayoutY(index, e.nativeEvent.layout.y)}>
      <Animated.Text style={[styles.line, big ? styles.lineBig : styles.lineCompact, {opacity}]}>
        {line.value}
      </Animated.Text>
    </Pressable>
  );
});

type Props = {
  /** undefined while loading, null when the track has no lyrics. */
  lyrics: LyricsData | undefined;
  onSeek: (seconds: number) => void;
  /** Landscape: slightly smaller lines. */
  compact?: boolean;
};

export default function PlayerLyrics({lyrics, onSeek, compact}: Props) {
  const t = useT();
  const {position} = useProgress(PROGRESS_INTERVAL_MS);
  const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
  const synced = !!lyrics?.synced;

  const scrollRef = useRef<ScrollView>(null);
  const lineY = useRef<number[]>([]);
  const viewHeight = useRef(0);
  const following = useRef(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIdx = useMemo(() => {
    if (!synced || lines.length === 0) return -1;
    const posMs = position * 1000;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i].start ?? 0) <= posMs) idx = i;
      else break;
    }
    return idx;
  }, [position, lines, synced]);

  const scrollToLine = useCallback((index: number, animated: boolean) => {
    const y = lineY.current[index];
    if (y == null) return;
    scrollRef.current?.scrollTo({y: Math.max(0, y - viewHeight.current * ACTIVE_LINE_AT), animated});
  }, []);

  // New track: forget the old layout and start from the top.
  useEffect(() => {
    lineY.current = [];
    following.current = true;
    scrollRef.current?.scrollTo({y: 0, animated: false});
  }, [lyrics]);

  useEffect(() => {
    if (activeIdx >= 0 && following.current) scrollToLine(activeIdx, true);
  }, [activeIdx, scrollToLine]);

  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  const onLayoutY = useCallback((index: number, y: number) => {
    lineY.current[index] = y;
    // The current line laid out after the first scroll attempt: place it now.
    if (index === activeIdx && following.current) scrollToLine(index, false);
  }, [activeIdx, scrollToLine]);

  const pauseFollowing = useCallback(() => {
    following.current = false;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      following.current = true;
      if (activeIdx >= 0) scrollToLine(activeIdx, true);
    }, RESUME_FOLLOW_MS);
  }, [activeIdx, scrollToLine]);

  const onLinePress = useCallback((index: number) => {
    const start = lines[index]?.start;
    if (start == null) return;
    following.current = true;
    onSeek(start / 1000);
  }, [lines, onSeek]);

  if (lyrics === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="rgba(255,255,255,0.6)" />
      </View>
    );
  }
  if (lines.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{t.lyricsScreen.noLyrics}</Text>
      </View>
    );
  }

  return (
    <MaskedView
      style={styles.scroll}
      maskElement={<LinearGradient colors={FADE_COLORS} locations={FADE_STOPS} style={styles.scroll} />}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onLayout={e => { viewHeight.current = e.nativeEvent.layout.height; }}
        onScrollBeginDrag={pauseFollowing}
        onScrollEndDrag={scheduleResume}
        onMomentumScrollBegin={pauseFollowing}
        onMomentumScrollEnd={scheduleResume}>
        {lines.map((line, i) => (
          <LyricLineRow
            key={i}
            line={line}
            index={i}
            state={!synced ? 'plain' : i === activeIdx ? 'active' : i < activeIdx ? 'past' : 'upcoming'}
            big={!compact}
            onLayoutY={onLayoutY}
            onPress={synced ? onLinePress : undefined}
          />
        ))}
      </ScrollView>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  scroll: {flex: 1},
  content: {
    paddingTop: 24,
    paddingBottom: 160,
    gap: 16,
  },
  line: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  lineBig: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  lineCompact: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 17,
    fontWeight: '600',
  },
});
