/**
 * @file SectionHeader.tsx
 * @description Section title row with an optional "See all" action link.
 *   Used in horizontal scroll sections on the Home screen.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {darkTheme} from '../theme';

type Props = {
  title: string;
  onSeeAll?: () => void;
};

export default function SectionHeader({title, onSeeAll}: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={styles.seeAll}>Voir tout</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: darkTheme.textPrimary,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: darkTheme.textSecondary,
  },
});
