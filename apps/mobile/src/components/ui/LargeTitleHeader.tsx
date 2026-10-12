/**
 * @file LargeTitleHeader.tsx
 * @description Design v2 large-title header. The screen shows a large title
 *   at the top of its scrolling content (`LargeTitle`); once it scrolls under
 *   the top edge, a compact glass bar (`LargeTitleHeader`) fades in with the
 *   title in small type and the screen's actions; its frosting fades out
 *   below the bar instead of ending on a hard line. Pulling down past the top
 *   gently enlarges the large title. Both read the scroll position from
 *   `useLargeTitleScroll`, entirely on the UI thread.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import Text from './Text';
import {sizes, spacing, typography} from '../../theme';

/** Scroll distance over which the compact bar fades in. */
const SWITCH_AT = typography.largeTitle.lineHeight;
const FADE = 12;
/** Height of the compact bar, below the status bar. */
export const COMPACT_BAR_HEIGHT = 48;
/** Extra height below the bar over which the frosted glass fades out. */
const FADE_TAIL = 36;

export function useLargeTitleScroll() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  return {scrollY, onScroll};
}

type TitleProps = {
  title: string;
  scrollY: SharedValue<number>;
};

/** The large title, first item of the scrolling content. */
export function LargeTitle({title, scrollY}: TitleProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [SWITCH_AT - FADE, SWITCH_AT], [1, 0], Extrapolation.CLAMP),
    transform: [{scale: interpolate(scrollY.value, [-120, 0], [1.1, 1], Extrapolation.CLAMP)}],
  }));
  return (
    <Animated.View style={[styles.large, style]}>
      <Text variant="largeTitle" accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

type HeaderProps = TitleProps & {
  left?: React.ReactNode;
  right?: React.ReactNode;
};

/** The compact bar pinned over the top of the screen. Keeps actions visible. */
export function LargeTitleHeader({title, scrollY, left, right}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [SWITCH_AT - FADE, SWITCH_AT], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View pointerEvents="box-none" style={[styles.header, {paddingTop: insets.top}]}>
      <Animated.View pointerEvents="none" style={[styles.glass, {bottom: -FADE_TAIL}, barStyle]}>
        <GlassSurface
          variant="fade"
          solidRatio={(insets.top + COMPACT_BAR_HEIGHT * 0.6) / (insets.top + COMPACT_BAR_HEIGHT + FADE_TAIL)}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.bar}>
        <View style={styles.side}>{left}</View>
        <Animated.View style={[styles.center, barStyle]} importantForAccessibility="no-hide-descendants">
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

/** Top padding a screen's content needs to start below the compact bar. */
export function useLargeTitleInset(): number {
  return useSafeAreaInsets().top + COMPACT_BAR_HEIGHT;
}

const styles = StyleSheet.create({
  large: {paddingHorizontal: spacing.gutter, paddingBottom: spacing.s, transformOrigin: 'left'},
  header: {position: 'absolute', top: 0, left: 0, right: 0},
  glass: {position: 'absolute', top: 0, left: 0, right: 0},
  bar: {
    height: COMPACT_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
  },
  side: {width: sizes.touchTarget * 2, flexDirection: 'row', alignItems: 'center'},
  right: {justifyContent: 'flex-end', gap: spacing.xs},
  center: {flex: 1, alignItems: 'center'},
});
