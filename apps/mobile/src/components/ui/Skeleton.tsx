/**
 * @file Skeleton.tsx
 * @description Design v2 loading placeholders: a softly pulsing block, plus
 *   ready-made shapes for a track row and a collection card. Static when the
 *   OS "Remove animations" setting is on.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect} from 'react';
import {StyleSheet, View, type DimensionValue} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {colors, radii, spacing} from '../../theme';
import {COLLECTION_CARD_WIDTH} from './CollectionCard';

const PULSE_MS = 800;

type BlockProps = {
  width: DimensionValue;
  height: number;
  radius?: number;
};

export function Skeleton({width, height, radius = radii.cover}: BlockProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.45, {duration: PULSE_MS, easing: Easing.inOut(Easing.ease)}),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({opacity: opacity.value}));
  return <Animated.View style={[styles.block, {width, height, borderRadius: radius}, style]} />;
}

export function SkeletonTrackRow() {
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      <Skeleton width={48} height={48} />
      <View style={styles.lines}>
        <Skeleton width="70%" height={14} radius={radii.full} />
        <Skeleton width="45%" height={12} radius={radii.full} />
      </View>
    </View>
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card} importantForAccessibility="no-hide-descendants">
      <Skeleton width={COLLECTION_CARD_WIDTH} height={COLLECTION_CARD_WIDTH} radius={radii.tile} />
      <Skeleton width="80%" height={12} radius={radii.full} />
      <Skeleton width="55%" height={12} radius={radii.full} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {backgroundColor: colors.surface2},
  row: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
    paddingHorizontal: spacing.gutter,
  },
  lines: {flex: 1, gap: spacing.s},
  card: {width: COLLECTION_CARD_WIDTH, gap: spacing.s},
});
