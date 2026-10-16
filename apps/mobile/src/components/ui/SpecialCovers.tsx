/**
 * @file SpecialCovers.tsx
 * @description Covers of the library's built-in collections and the
 *   placeholder of a playlist without artwork: Liked songs (heart on a purple
 *   to blue gradient), My music (notes on slate) and an empty playlist (lines
 *   on the alternate surface). Drawn with the shared icons.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {HeartIcon, MusicNoteIcon, PlaylistIcon} from '../icons';
import {darkTheme} from '../../theme';

type Props = {size: number; borderRadius?: number};

/** Gradients of the built-in collections, shared with the Library tiles. */
export const LIKED_COVER_COLORS = ['#6B2FA0', '#1E3A8A'];
export const ALL_SONGS_COVER_COLORS = ['#2C3E50', '#12181f'];

/** Glyph size relative to the cover. */
const GLYPH = 0.42;

export function LikedCover({size, borderRadius = 6}: Props) {
  return (
    <LinearGradient colors={LIKED_COVER_COLORS} style={[styles.box, {width: size, height: size, borderRadius}]}>
      <HeartIcon size={size * 0.45} color="#fff" filled />
    </LinearGradient>
  );
}

export function AllSongsCover({size, borderRadius = 6}: Props) {
  return (
    <LinearGradient colors={ALL_SONGS_COVER_COLORS} style={[styles.box, {width: size, height: size, borderRadius}]}>
      <MusicNoteIcon size={size * GLYPH} color="#fff" />
    </LinearGradient>
  );
}

export function EmptyPlaylistCover({size, borderRadius = 6}: Props) {
  return (
    <View style={[styles.box, styles.empty, {width: size, height: size, borderRadius}]}>
      <PlaylistIcon size={size * GLYPH} color="#aaa" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {alignItems: 'center', justifyContent: 'center'},
  empty: {backgroundColor: darkTheme.surfaceAlt},
});
