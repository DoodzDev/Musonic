/**
 * @file DesignSection.tsx
 * @description Titled card grouping one topic of the Design screen.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Text from '../../components/ui/Text';
import {colors, radii, spacing} from '../../theme';

type Props = {title: string; children: React.ReactNode};

export default function DesignSection({title, children}: Props) {
  return (
    <View style={styles.section}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginTop: spacing.l, gap: spacing.s},
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.card,
    padding: spacing.m,
    gap: spacing.m,
  },
});
