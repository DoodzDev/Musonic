/**
 * @file Toggle.tsx
 * @description Design v2 on/off switch (51 × 31). Accent track when on; the
 *   knob slides on the UI thread and a selection haptic plays on change.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {colors, timings} from '../../theme';
import {haptic} from '../../services/haptics';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Name read by TalkBack, usually the label of the row. */
  accessibilityLabel: string;
};

const WIDTH = 51;
const HEIGHT = 31;
const KNOB = 27;
const TRAVEL = WIDTH - KNOB - 4;

export default function Toggle({value, onValueChange, disabled, accessibilityLabel}: Props) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, timings.press);
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.fill, colors.accent]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{translateX: progress.value * TRAVEL}],
  }));

  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onValueChange(!value);
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{checked: value, disabled}}
      accessibilityLabel={accessibilityLabel}
      style={disabled && styles.disabled}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    padding: 2,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.textPrimary,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.25)',
  },
  disabled: {opacity: 0.4},
});
