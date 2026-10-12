/**
 * @file ArtistAvatar.tsx
 * @description Design v2 round artist picture, with the artist's initial on a
 *   neutral disc until (or instead of) an image.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import Text from './Text';
import {resolveCoverUri} from './Cover';
import {colors} from '../../theme';

type Props = {
  name: string;
  /** Server cover art id of the artist. */
  id?: string;
  imageUrl?: string;
  /** Diameter, 104 on carousels by default. */
  size?: number;
};

function ArtistAvatar({name, id, imageUrl, size = 104}: Props) {
  const uri = resolveCoverUri(id, imageUrl, undefined, size);
  const box = {width: size, height: size, borderRadius: size / 2};
  return (
    <View style={[styles.disc, box]} accessible accessibilityLabel={name} accessibilityRole="image">
      <Text variant="title1" color="textSecondary" style={{fontSize: size * 0.38, lineHeight: size * 0.46}}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
      {uri ? (
        <FastImage
          style={[StyleSheet.absoluteFill, box]}
          source={{uri, priority: FastImage.priority.normal}}
          resizeMode={FastImage.resizeMode.cover}
        />
      ) : null}
    </View>
  );
}

export default React.memo(ArtistAvatar);

const styles = StyleSheet.create({
  disc: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
