/**
 * @file SectionHeader.tsx
 * @description Design v2 section header: title, optional subtitle and an
 *   optional "See all" link (translated). Replaces the legacy SectionHeader
 *   and its hard-coded "Voir tout" as screens are rebuilt.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Text from './Text';
import Button from './Button';
import {spacing} from '../../theme';
import {useT} from '../../i18n';

type Props = {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
};

export default function SectionHeader({title, subtitle, onSeeAll}: Props) {
  const t = useT();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="title2" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onSeeAll ? (
        <Button
          variant="plain"
          label={t.ui.seeAll}
          onPress={onSeeAll}
          accessibilityLabel={`${t.ui.seeAll} : ${title}`}
          style={styles.seeAll}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  text: {flex: 1, gap: 2},
  seeAll: {marginRight: -spacing.s, marginBottom: -10},
});
