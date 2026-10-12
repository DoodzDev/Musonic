/**
 * @file gestures.tsx
 * @description Design v2 gesture module: one set of thresholds, one resistance
 *   curve and one haptic rule for every swipe in the app (ADR-010 B4: the old
 *   gestures were rebuilt from scratch).
 *   - `SwipeSurface`: up / left / right swipes on a surface (mini player).
 *   - `SwipeableRow`: swipe a row left to reveal one action.
 *   The Sheet's swipe-to-close uses the same thresholds.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Text from './Text';
import {colors, springs, spacing, timings} from '../../theme';
import {haptic} from '../../services/haptics';

/** Shared thresholds: a swipe counts past this distance or this speed. */
export const SWIPE = {
  /** pt the finger must travel. */
  distance: 72,
  /** pt/s that also counts as a swipe, even if short. */
  velocity: 700,
  /** pt before the gesture claims the touch (lets taps and scrolls through). */
  activation: 12,
} as const;

/** Swipe-to-close of sheets: a bit further, so a scroll never closes one. */
export const DISMISS = {distance: 110, velocity: 900} as const;

/** Past `limit`, movement is damped so the surface feels elastic. */
export function rubberBand(offset: number, limit: number): number {
  'worklet';
  const abs = Math.abs(offset);
  if (abs <= limit) return offset;
  const extra = abs - limit;
  return Math.sign(offset) * (limit + extra * 0.25);
}

function selectionHaptic() {
  haptic('selection');
}

// ─── SwipeSurface ─────────────────────────────────────────────────────────────

type Direction = 'up' | 'left' | 'right';

type SurfaceProps = {
  onSwipeUp?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function SwipeSurface({onSwipeUp, onSwipeLeft, onSwipeRight, onPress, style, children}: SurfaceProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(false);

  const fire = (dir: Direction) => {
    if (dir === 'up') onSwipeUp?.();
    else if (dir === 'left') onSwipeLeft?.();
    else onSwipeRight?.();
  };

  const pan = Gesture.Pan()
    .minDistance(SWIPE.activation)
    .onUpdate(e => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      x.value = horizontal ? rubberBand(e.translationX, SWIPE.distance) : 0;
      y.value = horizontal ? 0 : rubberBand(Math.min(0, e.translationY), SWIPE.distance);
      const past = horizontal
        ? Math.abs(e.translationX) > SWIPE.distance
        : -e.translationY > SWIPE.distance;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(selectionHaptic)();
      }
    })
    .onEnd(e => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      let dir: Direction | null = null;
      if (horizontal) {
        if (e.translationX > SWIPE.distance || e.velocityX > SWIPE.velocity) dir = 'right';
        else if (e.translationX < -SWIPE.distance || e.velocityX < -SWIPE.velocity) dir = 'left';
      } else if (-e.translationY > SWIPE.distance || e.velocityY < -SWIPE.velocity) {
        dir = 'up';
      }
      x.value = withSpring(0, springs.sheet);
      y.value = withSpring(0, springs.sheet);
      armed.value = false;
      if (dir) runOnJS(fire)(dir);
    });

  const tap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok && onPress) runOnJS(onPress)();
  });

  const style2 = useAnimatedStyle(() => ({
    transform: [{translateX: x.value}, {translateY: y.value}],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View style={[style, style2]}>{children}</Animated.View>
    </GestureDetector>
  );
}

// ─── SwipeableRow ─────────────────────────────────────────────────────────────

type RowProps = {
  /** Action revealed on the right when the row is swiped left. */
  actionLabel: string;
  actionIcon?: React.ReactNode;
  destructive?: boolean;
  onAction: () => void;
  /** Colour behind the row content, matching the list it sits in. */
  background?: string;
  children: React.ReactNode;
};

const ACTION_WIDTH = 96;

export function SwipeableRow({
  actionLabel,
  actionIcon,
  destructive,
  onAction,
  background = colors.background,
  children,
}: RowProps) {
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = Gesture.Pan()
    .activeOffsetX([-SWIPE.activation, SWIPE.activation])
    .failOffsetY([-SWIPE.activation, SWIPE.activation])
    .onUpdate(e => {
      x.value = rubberBand(Math.min(0, e.translationX), ACTION_WIDTH);
      const past = -e.translationX > ACTION_WIDTH;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(selectionHaptic)();
      }
    })
    .onEnd(e => {
      const fired = -e.translationX > ACTION_WIDTH || e.velocityX < -SWIPE.velocity * 1.5;
      armed.value = false;
      if (fired) {
        x.value = withTiming(0, timings.press);
        runOnJS(onAction)();
      } else {
        x.value = withSpring(0, springs.sheet);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));
  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -x.value / (ACTION_WIDTH * 0.6)),
  }));

  return (
    <View
      accessibilityActions={[{name: 'swipeAction', label: actionLabel}]}
      onAccessibilityAction={e => e.nativeEvent.actionName === 'swipeAction' && onAction()}>
      <Animated.View
        style={[
          styles.action,
          {backgroundColor: destructive ? colors.destructive : colors.accent},
          actionStyle,
        ]}
        importantForAccessibility="no-hide-descendants">
        {actionIcon}
        <Text variant="caption" style={styles.actionLabel}>
          {actionLabel}
        </Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{backgroundColor: background}, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    ...StyleSheet.absoluteFill,
    left: undefined,
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.l,
    gap: spacing.xs,
  },
  actionLabel: {color: colors.onAccent},
});
