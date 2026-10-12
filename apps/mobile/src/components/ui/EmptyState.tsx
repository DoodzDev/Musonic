/**
 * @file EmptyState.tsx
 * @description Design v2 empty state: icon, title, explanation and an optional
 *   action, centred in the space left by an empty list or failed load.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Text from './Text';
import Button from './Button';
import {spacing} from '../../theme';

type Props = {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: {label: string; onPress: () => void};
};

export default function EmptyState({icon, title, message, action}: Props) {
  return (
    <View style={styles.box}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="title3" style={styles.center} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="subhead" color="textSecondary" style={styles.center}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <Button variant="tinted" label={action.label} onPress={action.onPress} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  icon: {marginBottom: spacing.xs},
  center: {textAlign: 'center'},
  action: {marginTop: spacing.s},
});
