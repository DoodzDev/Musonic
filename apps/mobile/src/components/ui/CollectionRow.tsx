/**
 * @file CollectionRow.tsx
 * @description Design v2 list row for a playlist, album or artist: cover
 *   (round for artists), name (accent while it plays), subtitle with an
 *   optional pin and badges, a chevron, and an optional hairline separator
 *   aligned on the text.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Text from './Text';
import Badge, {type BadgeKind} from './Badge';
import Cover from './Cover';
import ArtistAvatar from './ArtistAvatar';
import {BackArrowIcon, PinIcon} from '../icons';
import {colors, sizes, spacing} from '../../theme';

const COVER = 56;
const GAP = spacing.m - 4;

export type CollectionKind = 'playlist' | 'album' | 'artist';

type Props = {
  kind: CollectionKind;
  name: string;
  subtitle?: string;
  coverId?: string;
  coverUrl?: string;
  playlistId?: string;
  badges?: BadgeKind[];
  /** Pinned on top of its list: a small pin before the subtitle. */
  pinned?: boolean;
  /** Playing now: the name takes the accent colour. */
  active?: boolean;
  /** Hairline under the row, from the text to the right edge. */
  separator?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

function CollectionRow({kind, name, subtitle, coverId, coverUrl, playlistId, badges, pinned, active, separator, onPress, onLongPress}: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')}
      android_ripple={{color: colors.fill}}
      style={styles.row}>
      {kind === 'artist' ? (
        <ArtistAvatar name={name} id={coverId} imageUrl={coverUrl} size={COVER} />
      ) : (
        <Cover id={coverId} imageUrl={coverUrl} playlistId={playlistId} size="tile" />
      )}
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={[styles.name, active && styles.active]}>
          {name}
        </Text>
        {subtitle || badges?.length || pinned ? (
          <View style={styles.meta}>
            {pinned ? <PinIcon size={12} color={colors.accent} filled /> : null}
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
      {separator ? <View style={styles.separator} /> : null}
    </Pressable>
  );
}

export default React.memo(CollectionRow);

const styles = StyleSheet.create({
  row: {
    height: sizes.listRowMax,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    paddingHorizontal: spacing.gutter,
  },
  text: {flex: 1, minWidth: 0, gap: 2},
  name: {fontWeight: '500'},
  active: {color: colors.accent},
  meta: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  subtitle: {flexShrink: 1},
  chevron: {transform: [{scaleX: -1}]},
  separator: {
    position: 'absolute',
    left: spacing.gutter + COVER + GAP,
    right: 0,
    bottom: 0,
    height: sizes.hairline,
    backgroundColor: colors.separator,
  },
});
