/**
 * @file Cover.tsx
 * @description Design v2 cover art. Standard sizes with matching corner radii,
 *   optional tinted hero shadow and a fade-in once the image is loaded (large
 *   sizes only: list rows skip it so scrolling never flickers). Resolves the
 *   image like the legacy CoverArt: custom playlist cover, explicit URL, then
 *   server cover art.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {getCoverArtUrl} from '../../api/client';
import {storage} from '../../store/storage';
import {colors, radii, heroShadow} from '../../theme';

export type CoverSize = 'row' | 'tile' | 'card' | 'hero';

const SIZES: Record<CoverSize, number> = {row: 48, tile: 56, card: 150, hero: 264};

const RADII: Record<CoverSize, number> = {
  row: radii.cover,
  tile: radii.cover,
  card: radii.tile,
  hero: radii.button,
};

const FADE_MS = 200;

type Props = {
  /** Server cover art id. */
  id?: string;
  imageUrl?: string;
  /** Picks up a custom cover chosen for this playlist on the device. */
  playlistId?: string;
  size: CoverSize;
  /** Dominant colour (`#RRGGBB`) for the tinted hero shadow. */
  tint?: string;
  /** Round instead of rounded-square (artists). */
  round?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function resolveCoverUri(
  id: string | undefined,
  imageUrl: string | undefined,
  playlistId: string | undefined,
  px: number,
): string | null {
  const local = playlistId ? storage.getString(`coverart_pl_${playlistId}`) : undefined;
  return local ?? imageUrl ?? (id ? getCoverArtUrl(id, px * 2) : null);
}

/** Large covers fade in once loaded; the hooks live here so rows pay nothing. */
function FadingImage({uri}: {uri: string}) {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({opacity: opacity.value}));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <FastImage
        style={StyleSheet.absoluteFill}
        source={{uri, priority: FastImage.priority.normal}}
        resizeMode={FastImage.resizeMode.cover}
        onLoad={() => (opacity.value = withTiming(1, {duration: FADE_MS}))}
      />
    </Animated.View>
  );
}

function Cover({id, imageUrl, playlistId, size, tint, round, style}: Props) {
  const px = SIZES[size];
  const radius = round ? px / 2 : RADII[size];
  const uri = resolveCoverUri(id, imageUrl, playlistId, px);
  const fade = size === 'card' || size === 'hero';
  const box = {width: px, height: px, borderRadius: radius};

  return (
    <View style={[box, tint ? heroShadow(tint) : null, style]}>
      <View style={[styles.clip, box]}>
        {uri && fade ? <FadingImage uri={uri} /> : null}
        {uri && !fade ? (
          <FastImage
            style={StyleSheet.absoluteFill}
            source={{uri, priority: FastImage.priority.normal}}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(Cover);

const styles = StyleSheet.create({
  clip: {overflow: 'hidden', backgroundColor: colors.surface2},
});
