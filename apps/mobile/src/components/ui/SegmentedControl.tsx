/**
 * @file SegmentedControl.tsx
 * @description Design v2 segmented control (2-4 equal segments). The selected
 *   segment's thumb slides on the UI thread; a selection haptic plays on change.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import Text from './Text';
import {colors, timings} from '../../theme';
import {haptic} from '../../services/haptics';

type Option<T extends string | number> = {value: T; label: string};

type Props<T extends string | number> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

const PADDING = 2;

export default function SegmentedControl<T extends string | number>({options, value, onChange}: Props<T>) {
  const [width, setWidth] = useState(0);
  const segment = width > 0 ? (width - PADDING * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex(o => o.value === value));
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(index * segment, timings.press);
  }, [index, segment, x]);

  const thumbStyle = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.track} onLayout={onLayout} accessibilityRole="tablist">
      {segment > 0 && <Animated.View style={[styles.thumb, {width: segment}, thumbStyle]} />}
      {options.map(o => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            accessibilityLabel={o.label}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onChange(o.value);
            }}>
            <Text variant="footnote" style={styles.label} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 32,
    padding: PADDING,
    borderRadius: 9,
    backgroundColor: colors.fill,
    flexDirection: 'row',
  },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderRadius: 7,
    backgroundColor: colors.segmentThumb,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.25)',
  },
  segment: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  label: {fontWeight: '600'},
});
