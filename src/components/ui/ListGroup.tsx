/**
 * @file ListGroup.tsx
 * @description Design v2 inset grouped list (Settings): rounded surface,
 *   optional caption above and note below, rows separated by inset hairlines.
 *   `ListItem` takes an icon, a label, an optional value and an accessory
 *   (chevron, toggle or any element).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Text from './Text';
import Toggle from './Toggle';
import BackArrowIcon from '../icons/BackArrowIcon';
import {colors, radii, sizes, spacing} from '../../theme';

type GroupProps = {
  caption?: string;
  note?: string;
  children: React.ReactNode;
};

export function ListGroup({caption, note, children}: GroupProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {caption ? (
        <Text variant="footnote" color="textSecondary" accessibilityRole="header" style={styles.caption}>
          {caption.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.surface}>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {item}
          </React.Fragment>
        ))}
      </View>
      {note ? (
        <Text variant="footnote" color="textSecondary" style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

type ItemProps = {
  label: string;
  icon?: React.ReactNode;
  value?: string;
  /** `chevron` for navigation; a toggle via `toggle`; or any element. */
  accessory?: 'chevron' | React.ReactNode;
  toggle?: {value: boolean; onValueChange: (v: boolean) => void};
  destructive?: boolean;
  onPress?: () => void;
};

export function ListItem({label, icon, value, accessory, toggle, destructive, onPress}: ItemProps) {
  const content = (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text variant="body" numberOfLines={1} style={[styles.label, destructive && styles.destructive]}>
        {label}
      </Text>
      {value ? (
        <Text variant="body" color="textSecondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {toggle ? (
        <Toggle value={toggle.value} onValueChange={toggle.onValueChange} accessibilityLabel={label} />
      ) : accessory === 'chevron' ? (
        <View style={styles.chevron}>
          <BackArrowIcon size={16} color={colors.separator} />
        </View>
      ) : (
        accessory ?? null
      )}
    </>
  );

  if (!onPress || toggle) {
    return <View style={styles.item}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      android_ripple={{color: colors.fill}}
      style={styles.item}>
      {content}
    </Pressable>
  );
}

const ICON_COLUMN = 28;

const styles = StyleSheet.create({
  group: {gap: spacing.s - 2},
  caption: {paddingHorizontal: spacing.m},
  note: {paddingHorizontal: spacing.m},
  surface: {
    backgroundColor: colors.surface1,
    borderRadius: radii.tile,
    overflow: 'hidden',
  },
  item: {
    minHeight: sizes.listRowMin,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
  },
  icon: {width: ICON_COLUMN, alignItems: 'center'},
  label: {flex: 1},
  destructive: {color: colors.destructive},
  chevron: {transform: [{scaleX: -1}]},
  separator: {
    height: sizes.hairline,
    backgroundColor: colors.separator,
    marginLeft: spacing.m,
  },
});
