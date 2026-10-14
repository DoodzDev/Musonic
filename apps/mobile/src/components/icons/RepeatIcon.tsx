/**
 * @file RepeatIcon.tsx
 * @description Repeat playback icon. When `mode` is provided, handles color and
 *   active-dot automatically and shows a "1" for repeat one. When `color` is
 *   provided, it wins and no dot is drawn (bottom sheets); with `mode` too,
 *   the "1" still shows.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {darkTheme} from '../../theme';

type RepeatModeUI = 'none' | 'all' | 'one';

type Props = {
  mode?: RepeatModeUI;
  color?: string;
  size?: number;
  /** Dot under the icon while active; off where a filled button already shows the state. */
  indicator?: boolean;
};

export default function RepeatIcon({mode, color, size = 22, indicator = true}: Props) {
  const active = mode !== undefined ? mode !== 'none' : false;
  const col = color ?? (active ? darkTheme.accent : 'rgba(255,255,255,0.7)');

  return (
    <View style={[styles.wrap, indicator && styles.withDot]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14"
          stroke={col}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="m7 22-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"
          stroke={col}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {mode === 'one' && (
          <Path
            d="M11 10h1v4"
            stroke={col}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </Svg>
      {active && indicator && color === undefined && <View style={styles.dot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center'},
  /** Room for the dot under the icon; without it the glyph stays centred. */
  withDot: {minHeight: 28},
  dot: {
    position: 'absolute',
    bottom: -6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: darkTheme.accent,
    alignSelf: 'center',
  },
});
