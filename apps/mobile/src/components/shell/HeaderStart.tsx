/**
 * @file HeaderStart.tsx
 * @description Start of a tab header: the profile initial, then the Settings gear
 *   right beside it, both pinned in the compact bar.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import ProfileButton from './ProfileButton';
import SettingsButton from './SettingsButton';
import {spacing} from '../../theme';

export default function HeaderStart() {
  return (
    <View style={styles.row}>
      <ProfileButton />
      <SettingsButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.m},
});
