/**
 * @file HomeCards.tsx
 * @description Building blocks of the Design v2 Home (R5.1): quick access
 *   tile, album card, artist bubble, Magic Mix card, large "For you" card and
 *   the horizontal shelf that holds them. Every cover and card uses the shared
 *   "raised" relief (soft shadow + fine light edge) for a light 3D feel, and
 *   every card says what it is (album, track, playlist).
 * @author DoodzProg
 * @version 1.1.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {FlatList, Image, StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import PressableScale from '../ui/PressableScale';
import Raised from '../ui/Raised';
import Text from '../ui/Text';
import Cover from '../ui/Cover';
import CoverArt from '../CoverArt';
import ArtistAvatar from '../ui/ArtistAvatar';
import SectionHeader from '../ui/SectionHeader';
import {AllSongsCover, LikedCover} from '../ui/SpecialCovers';
import {CloudIcon, PlayIcon, SparkleIcon} from '../icons';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';

/** Horizontal padding of the Home, as in the mockup. */
export const HOME_GUTTER = 20;
const QUICK_HEIGHT = 56;
const CARD = 150;
const ARTIST = 104;
const FOR_YOU_W = 260;
const FOR_YOU_H = 300;
// Dark enough to stay readable on light covers.
const GLASS_PILL = 'rgba(0,0,0,0.55)';

// ─── Quick access ─────────────────────────────────────────────────────────────

export type QuickKind = 'liked' | 'allSongs' | 'playlist' | 'album';

export function QuickTile({kind, name, kindLabel, coverId, playlistId, onPress}: {
  kind: QuickKind;
  name: string;
  /** What it is: Playlist, Album… */
  kindLabel: string;
  coverId?: string;
  playlistId?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${name}, ${kindLabel}`} style={styles.quickPress}>
      <Raised radius={radii.tile} fill style={styles.quick}>
        <View style={styles.quickInner}>
          {kind === 'liked' ? (
            <LikedCover size={QUICK_HEIGHT} borderRadius={0} />
          ) : kind === 'allSongs' ? (
            <AllSongsCover size={QUICK_HEIGHT} borderRadius={0} />
          ) : (
            <CoverArt id={coverId} playlistId={playlistId} size={QUICK_HEIGHT} borderRadius={0} />
          )}
          <View style={styles.quickText}>
            <Text variant="footnote" numberOfLines={1} style={styles.quickName}>{name}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.quickKind}>{kindLabel}</Text>
          </View>
        </View>
      </Raised>
    </PressableScale>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export function AlbumCard({name, subtitle, coverId, coverUrl, playlistId, special, onPress}: {
  name: string;
  subtitle?: string;
  coverId?: string;
  coverUrl?: string;
  /** Custom cover chosen for this playlist on the device. */
  playlistId?: string;
  /** Built-in collections drawn instead of a cover. */
  special?: 'liked' | 'library';
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={[name, subtitle].filter(Boolean).join(', ')} style={styles.card}>
      <Raised radius={radii.tile}>
        {special === 'liked' ? (
          <LikedCover size={CARD} borderRadius={radii.tile} />
        ) : special === 'library' ? (
          <AllSongsCover size={CARD} borderRadius={radii.tile} />
        ) : (
          <Cover id={coverId} imageUrl={coverUrl} playlistId={playlistId} size="card" />
        )}
      </Raised>
      <View style={styles.cardText}>
        <Text variant="footnote" numberOfLines={1} style={styles.bold}>{name}</Text>
        {subtitle ? <Text variant="footnote" color="textSecondary" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </PressableScale>
  );
}

export function ArtistBubble({name, coverId, imageUrl, onPress}: {
  name: string;
  coverId?: string;
  imageUrl?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={name} style={styles.artist}>
      <Raised radius={ARTIST / 2} shadow={false}>
        <ArtistAvatar name={name} id={coverId} imageUrl={imageUrl} size={ARTIST} />
      </Raised>
      <Text variant="footnote" numberOfLines={1} style={styles.artistName}>{name}</Text>
    </PressableScale>
  );
}

/** Magic Mix: a 2 × 2 mosaic of the mix covers, the "Magic" pill and the mood. */
export function MixCard({name, subtitle, covers, onPress, accessibilityLabel}: {
  name: string;
  subtitle: string;
  covers: string[];
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const t = useT();
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  const half = CARD / 2;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.card}>
      <Raised radius={radii.button} fill style={styles.mix}>
        <View style={styles.mosaic}>
          {tiles.length === 4
            ? tiles.map(id => <CoverArt key={id} id={id} size={half} borderRadius={0} />)
            : <CoverArt id={tiles[0]} size={CARD} borderRadius={0} />}
        </View>
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.magicPill}>
          <SparkleIcon size={12} color={colors.accent} />
          <Text variant="caption" style={styles.magicText}>{t.ui.badgeMagic}</Text>
        </View>
        <Text variant="title3" numberOfLines={2} style={styles.mixName}>{name}</Text>
      </Raised>
      <Text variant="footnote" color="textSecondary" numberOfLines={1}>{subtitle}</Text>
    </PressableScale>
  );
}

/** "For you": a large album card found online, with the "Online" pill and a play button. */
export function ForYouCard({title, subtitle, imageUrl, onPress, onPlay, playLabel}: {
  title: string;
  /** "Album · artist". */
  subtitle: string;
  imageUrl: string;
  /** Opens the album. */
  onPress: () => void;
  /** The ▶ button: plays the album at once. */
  onPlay: () => void;
  playLabel: string;
}) {
  const t = useT();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${title}, ${subtitle}, ${t.ui.badgeOnline}`}>
      <Raised radius={radii.card} fill style={styles.forYou}>
        <Image source={{uri: imageUrl}} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.onlinePill}>
          <CloudIcon size={13} color={colors.textPrimary} />
          <Text variant="caption" style={styles.onlineText}>{t.ui.badgeOnline}</Text>
        </View>
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} style={styles.forYouBottom}>
          <View style={styles.forYouText}>
            <Text variant="headline" numberOfLines={1}>{title}</Text>
            <Text variant="footnote" numberOfLines={1} style={styles.forYouArtist}>{subtitle}</Text>
          </View>
          <PressableScale onPress={onPlay} haptic="light" hitSlop={10} accessibilityLabel={playLabel} style={styles.playDisc}>
            <PlayIcon size={16} color="#000" />
          </PressableScale>
        </LinearGradient>
      </Raised>
    </PressableScale>
  );
}

// ─── Shelf ────────────────────────────────────────────────────────────────────

export function HomeShelf<T>({title, subtitle, data, keyOf, renderItem, gap = 14}: {
  title: string;
  subtitle?: string;
  data: T[];
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactElement;
  gap?: number;
}) {
  if (data.length === 0) return null;
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHeader}>
        <SectionHeader title={title} subtitle={subtitle} />
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyOf}
        renderItem={({item, index}) => renderItem(item, index)}
        contentContainerStyle={[styles.shelfList, {gap}]}
        showsHorizontalScrollIndicator={false}
        // Room for the shadows of the raised cards.
        style={styles.shelfScroll}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quickPress: {flex: 1},
  quick: {height: QUICK_HEIGHT, backgroundColor: colors.surface1},
  quickInner: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 10},
  quickText: {flex: 1, minWidth: 0, gap: 1},
  quickName: {fontWeight: '600'},
  quickKind: {fontWeight: '500'},
  card: {width: CARD, gap: spacing.s},
  cardText: {gap: 1},
  bold: {fontWeight: '600'},
  artist: {width: ARTIST, alignItems: 'center', gap: spacing.s},
  artistName: {fontWeight: '500', textAlign: 'center'},
  mix: {width: CARD, height: CARD},
  mosaic: {width: CARD, height: CARD, flexDirection: 'row', flexWrap: 'wrap'},
  magicPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: GLASS_PILL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  magicText: {color: colors.accent},
  mixName: {position: 'absolute', left: 12, right: 12, bottom: 10},
  forYou: {width: FOR_YOU_W, height: FOR_YOU_H, backgroundColor: colors.surface1},
  onlinePill: {
    position: 'absolute',
    top: 14,
    left: 14,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: GLASS_PILL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  onlineText: {color: colors.textPrimary},
  forYouBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  forYouText: {flex: 1, minWidth: 0, gap: 2},
  forYouArtist: {color: 'rgba(255,255,255,0.75)'},
  playDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shelf: {marginBottom: 30},
  shelfHeader: {paddingHorizontal: HOME_GUTTER, paddingBottom: 12},
  shelfScroll: {overflow: 'visible'},
  shelfList: {paddingHorizontal: HOME_GUTTER, paddingBottom: 12},
});
