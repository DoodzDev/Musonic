/**
 * @file ShuffleMagicIcon.tsx
 * @description Shuffle icon with a sparkle star overlay indicating magic mode.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {G, Path} from 'react-native-svg';
import {darkTheme} from '../../theme';

type Props = {
  size?: number;
  color?: string;
};

export default function ShuffleMagicIcon({size = 22, color}: Props) {
  const col = color ?? darkTheme.accent;
  return (
    <View style={styles.wrap}>
      <View>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <G transform="translate(6,6) scale(0.75)">
            <Path
              d="m18 14 4 4-4 4m0-20 4 4-4 4"
              stroke={col}
              strokeWidth={2.66}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"
              stroke={col}
              strokeWidth={2.66}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M2 6h1.972a4 4 0 0 1 3.6 2.2"
              stroke={col}
              strokeWidth={2.66}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"
              stroke={col}
              strokeWidth={2.66}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
          <Path
            d="M7.5 0 C7.5 0 7.0 3.5 5.3 5.3 C3.5 7.0 0 7.5 0 7.5 C0 7.5 3.5 8.0 5.3 9.7 C7.0 11.5 7.5 15 7.5 15 C7.5 15 8.0 11.5 9.7 9.7 C11.5 8.0 15 7.5 15 7.5 C15 7.5 11.5 7.0 9.7 5.3 C8.0 3.5 7.5 0 7.5 0 Z"
            fill={col}
          />
        </Svg>
      </View>
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center'},
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: darkTheme.accent,
    marginTop: 3,
    alignSelf: 'center',
  },
});
