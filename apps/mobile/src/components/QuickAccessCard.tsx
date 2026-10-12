/**
 * @file QuickAccessCard.tsx
 * @description Compact card used in the Home screen quick-access grid. Renders
 *   a playlist, album, or Liked Songs shortcut with cover art or icon fallback.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import CoverArt from './CoverArt';
import {darkTheme} from '../theme';

type Props = {
  name: string;
  coverArt?: string;
  accent?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
};

export default function QuickAccessCard({name, coverArt, accent, icon, onPress}: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, accent ? {backgroundColor: accent + '33'} : null]}
      onPress={onPress}
      activeOpacity={0.7}>
      {icon ? (
        <View style={styles.iconBox}>{icon}</View>
      ) : (
        <CoverArt id={coverArt} size={52} borderRadius={4} />
      )}
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkTheme.surfaceAlt,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 10,
    paddingRight: 10,
    minHeight: 52,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    lineHeight: 17,
  },
  iconBox: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
