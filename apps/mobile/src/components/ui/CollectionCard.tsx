/**
 * @file CollectionCard.tsx
 * @description Design v2 card for a playlist, album or artist in carousels and
 *   grids: square cover (round for artists) with the name and subtitle below.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import PressableScale from './PressableScale';
import Text from './Text';
import Cover from './Cover';
import ArtistAvatar from './ArtistAvatar';
import {shadows, spacing} from '../../theme';
import type {CollectionKind} from './CollectionRow';

/** Card width, set by the 150 pt `card` cover. */
export const COLLECTION_CARD_WIDTH = 150;

type Props = {
  kind: CollectionKind;
  name: string;
  subtitle?: string;
  coverId?: string;
  coverUrl?: string;
  playlistId?: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

function CollectionCard({kind, name, subtitle, coverId, coverUrl, playlistId, onPress, onLongPress}: Props) {
  const artist = kind === 'artist';
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')}
      style={styles.card}>
      {artist ? (
        <ArtistAvatar name={name} id={coverId} imageUrl={coverUrl} size={COLLECTION_CARD_WIDTH} />
      ) : (
        <Cover id={coverId} imageUrl={coverUrl} playlistId={playlistId} size="card" style={shadows.card} />
      )}
      <View style={[styles.text, artist && styles.centered]}>
        <Text variant="footnote" numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

export default React.memo(CollectionCard);

const styles = StyleSheet.create({
  card: {width: COLLECTION_CARD_WIDTH, gap: spacing.s},
  text: {gap: 1},
  centered: {alignItems: 'center'},
  name: {fontWeight: '600'},
});
