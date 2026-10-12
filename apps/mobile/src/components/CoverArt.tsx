/**
 * @file CoverArt.tsx
 * @description FastImage wrapper for Subsonic cover art. Resolves the cover URL
 *   from a track/album ID and shows a dark placeholder while loading.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View, StyleSheet} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import {getCoverArtUrl} from '../api/client';
import {darkTheme} from '../theme';
import {storage} from '../store/storage';

type Props = {
  id?: string;
  size: number;
  borderRadius?: number;
  imageUrl?: string;
  playlistId?: string;
};

function getLocalPlaylistCover(playlistId: string): string | null {
  return storage.getString(`coverart_pl_${playlistId}`) ?? null;
}

function CoverArt({id, size, borderRadius = 4, imageUrl, playlistId}: Props) {
  const localUri = playlistId ? getLocalPlaylistCover(playlistId) : null;
  const uri = localUri ?? imageUrl ?? (id ? getCoverArtUrl(id, size * 2) : null);

  return (
    <View
      style={[
        styles.placeholder,
        {width: size, height: size, borderRadius},
        !uri && styles.empty,
      ]}>
      {uri && (
        <FastImage
          style={{width: size, height: size, borderRadius}}
          source={{uri, priority: FastImage.priority.normal}}
          resizeMode={FastImage.resizeMode.cover}
        />
      )}
    </View>
  );
}

export default React.memo(CoverArt);

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: darkTheme.surfaceAlt,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
