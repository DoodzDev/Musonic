/**
 * @file Equalizer.tsx
 * @description Three accent bars marking the track that is playing. They
 *   bounce while playback runs and rest at mid-height when paused.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {colors} from '../../theme';

const HEIGHT = 14;
const REST = 0.45;
const PERIOD_MS = 450;
const DELAYS = [0, 150, 300];

function Bar({playing, delay}: {playing: boolean; delay: number}) {
  const scale = useSharedValue(REST);

  useEffect(() => {
    if (playing) {
      scale.value = withDelay(
        delay,
        withRepeat(withTiming(1, {duration: PERIOD_MS, easing: Easing.inOut(Easing.ease)}), -1, true),
      );
    } else {
      cancelAnimation(scale);
      scale.value = withTiming(REST, {duration: PERIOD_MS});
    }
    return () => cancelAnimation(scale);
  }, [playing, delay, scale]);

  const style = useAnimatedStyle(() => ({transform: [{scaleY: scale.value}]}));
  return <Animated.View style={[styles.bar, style]} />;
}

export default function Equalizer({playing}: {playing: boolean}) {
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      {DELAYS.map(d => (
        <Bar key={d} playing={playing} delay={d} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: HEIGHT},
  bar: {
    width: 3,
    height: HEIGHT,
    borderRadius: 1.5,
    backgroundColor: colors.accent,
    transformOrigin: 'bottom',
  },
});
