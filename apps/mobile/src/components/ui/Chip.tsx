/**
 * @file Chip.tsx
 * @description Design v2 filter chip: white when selected, translucent fill
 *   otherwise. Plays a selection haptic when tapped.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import PressableScale from './PressableScale';
import Text from './Text';
import {colors, radii} from '../../theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export default function Chip({label, selected = false, onPress}: Props) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={label}
      accessibilityState={{selected}}
      hitSlop={6}
      style={[styles.chip, selected && styles.selected]}>
      <Text variant="subhead" style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    backgroundColor: colors.fill,
    justifyContent: 'center',
  },
  selected: {backgroundColor: colors.textPrimary},
  label: {fontWeight: '600'},
  selectedLabel: {color: colors.background},
});
