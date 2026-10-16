/**
 * @file Equalizer.tsx
 * @description Three bars marking the current track: fixed heights in the
 *   accent colour while playback runs, low and grey when paused. Never
 *   animated: an endless animation redraws the whole screen 60 times a second
 *   while the row is mounted (measured: CPU x3 at rest, choppy scrolling).
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../../theme';

const HEIGHT = 14;
/** Bar heights (share of HEIGHT) while playing, like a frozen equalizer. */
const PLAYING = [0.55, 1, 0.75];
const PAUSED = 0.35;

export default function Equalizer({playing}: {playing: boolean}) {
  const color = playing ? colors.accent : colors.textSecondary;
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      {PLAYING.map((share, i) => (
        <View key={i} style={[styles.bar, {height: HEIGHT * (playing ? share : PAUSED), backgroundColor: color}]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: HEIGHT},
  bar: {width: 3, borderRadius: 1.5},
});
