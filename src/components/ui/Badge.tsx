/**
 * @file Badge.tsx
 * @description Design v2 badges: Online (catalogue content), Magic, Downloaded
 *   and Lossless. Labels come from i18n; `small` fits inside list rows.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Text from './Text';
import CloudIcon from '../icons/CloudIcon';
import SparkleIcon from '../icons/SparkleIcon';
import DownloadArrowIcon from '../icons/DownloadArrowIcon';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';

export type BadgeKind = 'online' | 'magic' | 'downloaded' | 'lossless';

type Props = {
  kind: BadgeKind;
  size?: 'regular' | 'small';
};

const LOOK: Record<BadgeKind, {background: string; color: string}> = {
  online: {background: colors.badgeFill, color: colors.textPrimary},
  magic: {background: colors.accentFill, color: colors.accent},
  downloaded: {background: colors.successFill, color: colors.success},
  lossless: {background: colors.badgeFill, color: colors.textPrimary},
};

export default function Badge({kind, size = 'regular'}: Props) {
  const t = useT();
  const label = {
    online: t.ui.badgeOnline,
    magic: t.ui.badgeMagic,
    downloaded: t.ui.badgeDownloaded,
    lossless: t.ui.badgeLossless,
  }[kind];
  const {background, color} = LOOK[kind];
  const small = size === 'small';
  const iconSize = small ? 11 : 13;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.badge,
        small ? styles.small : styles.regular,
        kind === 'lossless' && styles.lossless,
        {backgroundColor: background},
      ]}>
      {kind === 'online' && <CloudIcon size={iconSize} color={color} />}
      {kind === 'magic' && <SparkleIcon size={iconSize} color={color} />}
      {kind === 'downloaded' && <DownloadArrowIcon size={iconSize} color={color} />}
      <Text
        variant="caption"
        style={[{color}, kind === 'lossless' && styles.losslessText]}>
        {kind === 'lossless' ? label.toUpperCase() : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radii.full,
  },
  regular: {height: 24, paddingHorizontal: 9},
  small: {height: 18, paddingHorizontal: 6},
  lossless: {borderRadius: 4},
  losslessText: {fontSize: 10, fontWeight: '700', letterSpacing: 0.4},
});
