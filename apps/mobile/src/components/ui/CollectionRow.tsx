/**
 * @file CollectionRow.tsx
 * @description Design v2 list row for a playlist, album or artist: cover
 *   (round for artists), name, subtitle with optional badges, and a chevron.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Text from './Text';
import Badge, {type BadgeKind} from './Badge';
import Cover from './Cover';
import ArtistAvatar from './ArtistAvatar';
import BackArrowIcon from '../icons/BackArrowIcon';
import {colors, sizes, spacing} from '../../theme';

export type CollectionKind = 'playlist' | 'album' | 'artist';

type Props = {
  kind: CollectionKind;
  name: string;
  subtitle?: string;
  coverId?: string;
  coverUrl?: string;
  playlistId?: string;
  badges?: BadgeKind[];
  onPress?: () => void;
  onLongPress?: () => void;
};

function CollectionRow({kind, name, subtitle, coverId, coverUrl, playlistId, badges, onPress, onLongPress}: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')}
      android_ripple={{color: colors.fill}}
      style={styles.row}>
      {kind === 'artist' ? (
        <ArtistAvatar name={name} id={coverId} imageUrl={coverUrl} size={56} />
      ) : (
        <Cover id={coverId} imageUrl={coverUrl} playlistId={playlistId} size="tile" />
      )}
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {subtitle || badges?.length ? (
          <View style={styles.meta}>
            {badges?.map(b => (
              <Badge key={b} kind={b} size="small" />
            ))}
            {subtitle ? (
              <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.chevron}>
        <BackArrowIcon size={16} color={colors.separator} />
      </View>
    </Pressable>
  );
}

export default React.memo(CollectionRow);

const styles = StyleSheet.create({
  row: {
    height: sizes.listRowMax,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
    paddingHorizontal: spacing.gutter,
  },
  text: {flex: 1, minWidth: 0, gap: 2},
  name: {fontWeight: '500'},
  meta: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  subtitle: {flexShrink: 1},
  chevron: {transform: [{scaleX: -1}]},
});
