/**
 * @file PressableScale.tsx
 * @description Design v2 press feedback: the element shrinks to PRESS_SCALE
 *   while held, then grows back. Runs on the UI thread (Reanimated) and jumps
 *   straight to the end when the OS "Remove animations" setting is on.
 *   Optionally plays a haptic as the press starts.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {PRESS_SCALE, timings} from '../../theme';
import {haptic as playHaptic, type HapticKind} from '../../services/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed; defaults to the design token. */
  scaleTo?: number;
  /** Haptic played when the press starts. */
  haptic?: HapticKind;
};

export default function PressableScale({
  scaleTo = PRESS_SCALE,
  haptic,
  style,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withTiming(scaleTo, timings.press);
    if (haptic) playHaptic(haptic);
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withTiming(1, timings.press);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}
