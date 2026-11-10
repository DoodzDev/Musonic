/**
 * @file PlayerProgress.tsx
 * @description Thin progress bar of the full player (Design v2, R4.1): no thumb,
 *   the bar thickens while dragged. Tap or drag anywhere on it to seek; the
 *   position is only sent to the player when the finger lifts. Elapsed time on
 *   the left, remaining time on the right, quality badge in the middle.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useRef, useState} from 'react';
import {StyleSheet, Text, View, type AccessibilityActionEvent} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {formatTime} from '../../utils/colorUtils';
import {useT} from '../../i18n';
import Badge from '../ui/Badge';
import {useSettingsStore} from '../../store/settingsStore';

/** Seconds moved by a screen reader's increment / decrement. */
const A11Y_STEP_S = 10;

type Props = {
  position: number;
  duration: number;
  quality: string | null;
  onSeek: (seconds: number) => void;
};

export default function PlayerProgress({position, duration, quality, onSeek}: Props) {
  const t = useT();
  const showRemaining = useSettingsStore(s => s.showRemainingTime);
  const [width, setWidth] = useState(0);
  /** Position under the finger while dragging, else null. */
  const [dragAt, setDragAt] = useState<number | null>(null);
  /** Last position under the finger: a plain tap never activates the pan, so the seek happens on finalize. */
  const lastAt = useRef<number | null>(null);
  const dur = duration > 0 ? duration : 1;

  const toSeconds = useCallback(
    (x: number) => (width > 0 ? Math.min(Math.max(x / width, 0), 1) * dur : 0),
    [width, dur],
  );

  const track = (x: number) => {
    lastAt.current = toSeconds(x);
    setDragAt(lastAt.current);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(e => track(e.x))
    .onUpdate(e => track(e.x))
    .onFinalize(() => {
      if (lastAt.current !== null) onSeek(lastAt.current);
      lastAt.current = null;
      setDragAt(null);
    });

  const shown = dragAt ?? Math.min(position, dur);
  const pct = `${(shown / dur) * 100}%` as const;

  const onA11yAction = useCallback((e: AccessibilityActionEvent) => {
    const delta = e.nativeEvent.actionName === 'increment' ? A11Y_STEP_S : -A11Y_STEP_S;
    onSeek(Math.min(Math.max(position + delta, 0), dur));
  }, [onSeek, position, dur]);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t.fullScreenPlayer.position}
          accessibilityValue={{text: `${formatTime(shown)} / ${formatTime(dur)}`}}
          accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
          onAccessibilityAction={onA11yAction}>
          <View style={[styles.track, dragAt !== null && styles.trackActive]}>
            <View style={[styles.fill, {width: pct}]} />
          </View>
        </View>
      </GestureDetector>
      <View style={styles.timeRow}>
        <Text style={styles.time} maxFontSizeMultiplier={1.2}>{formatTime(shown)}</Text>
        {quality ? <Badge kind="quality" label={quality} size="small" /> : null}
        <Text style={[styles.time, styles.timeRight]} maxFontSizeMultiplier={1.2}>
          {showRemaining ? `-${formatTime(dur - shown)}` : formatTime(dur)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  trackActive: {
    height: 10,
    borderRadius: 5,
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  time: {
    minWidth: 48,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  timeRight: {textAlign: 'right'},
});
