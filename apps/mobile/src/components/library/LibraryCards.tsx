/**
 * @file LibraryCards.tsx
 * @description Building blocks of the Design v2 Library (R5.3): the two large
 *   tiles at the top (Liked songs, My music) and the grid card of a playlist,
 *   album or artist. Same colours as the built-in covers and the shared
 *   neutral relief (`Raised`): no coloured glow.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import PressableScale from '../ui/PressableScale';
import Raised from '../ui/Raised';
import Text from '../ui/Text';
import CoverArt from '../CoverArt';
import ArtistAvatar from '../ui/ArtistAvatar';
import {HeartIcon, MusicNoteIcon, PinIcon} from '../icons';
import {LIKED_COVER_COLORS, ALL_SONGS_COVER_COLORS} from '../ui/SpecialCovers';
import {colors, radii, spacing} from '../../theme';

const TILE_HEIGHT = 92;

/** Large tile of a built-in collection: glyph at the top, name and count at the bottom. */
export function LibraryTile({kind, name, subtitle, onPress}: {
  kind: 'liked' | 'allSongs';
  name: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${name}, ${subtitle}`} style={styles.tilePress}>
      <Raised radius={radii.card - 4} fill style={styles.tile}>
        <LinearGradient
          colors={kind === 'liked' ? LIKED_COVER_COLORS : ALL_SONGS_COVER_COLORS}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.tileInner}>
          {kind === 'liked'
            ? <HeartIcon size={22} color={colors.textPrimary} filled />
            : <MusicNoteIcon size={22} color={colors.textPrimary} />}
          <View>
            <Text variant="subhead" numberOfLines={1} style={styles.tileName}>{name}</Text>
            <Text variant="caption" numberOfLines={1} style={styles.tileSub}>{subtitle}</Text>
          </View>
        </LinearGradient>
      </Raised>
    </PressableScale>
  );
}

/** Grid card: square cover (round for an artist), name and subtitle. */
export function LibraryGridCard({kind, name, subtitle, coverId, playlistId, width, pinned, active, onPress, onLongPress}: {
  kind: 'playlist' | 'album' | 'artist';
  name: string;
  subtitle?: string;
  coverId?: string;
  playlistId?: string;
  width: number;
  pinned?: boolean;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const artist = kind === 'artist';
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')}
      style={[styles.card, {width}]}>
      <Raised radius={artist ? width / 2 : radii.tile}>
        {artist ? (
          <ArtistAvatar name={name} id={coverId} size={width} />
        ) : (
          <CoverArt id={coverId} playlistId={playlistId} size={width} borderRadius={radii.tile} />
        )}
      </Raised>
      <View style={[styles.cardText, artist && styles.centered]}>
        <Text variant="footnote" numberOfLines={1} style={[styles.cardName, active && styles.active]}>{name}</Text>
        {subtitle || pinned ? (
          <View style={styles.cardMeta}>
            {pinned ? <PinIcon size={11} color={colors.accent} filled /> : null}
            {subtitle ? <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.cardSub}>{subtitle}</Text> : null}
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tilePress: {flex: 1},
  tile: {height: TILE_HEIGHT},
  tileInner: {flex: 1, padding: 14, justifyContent: 'space-between'},
  tileName: {fontWeight: '700'},
  tileSub: {color: 'rgba(255,255,255,0.8)'},
  card: {gap: spacing.s},
  cardText: {gap: 1},
  centered: {alignItems: 'center'},
  cardName: {fontWeight: '600'},
  active: {color: colors.accent},
  cardMeta: {flexDirection: 'row', alignItems: 'center', gap: 4},
  cardSub: {flexShrink: 1},
});
