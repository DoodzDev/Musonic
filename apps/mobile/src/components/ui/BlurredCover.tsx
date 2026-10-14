/**
 * @file BlurredCover.tsx
 * @description A cover drawn as an extremely blurred square of any size, for
 *   backgrounds. Cheap on purpose: the image is decoded at a tiny size,
 *   blurred once on that small bitmap, then scaled up by the GPU, whose
 *   smoothing does the rest. Never stretched: always a square.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Image, StyleSheet, View} from 'react-native';

/** Size (pt) at which the cover is decoded and blurred before being scaled up. */
const SMALL = 32;
/** Blur radius applied on the small bitmap: extreme once scaled up. */
const BLUR = 6;
/** Size to ask from the server for such a background: a few times SMALL. */
export const BLURRED_COVER_SOURCE_SIZE = 96;

type Props = {
  uri: string;
  /** Side of the square once scaled up (pt). */
  side: number;
  onLoad?: () => void;
};

export default function BlurredCover({uri, side, onLoad}: Props) {
  return (
    <View style={[styles.box, {width: side, height: side}]} pointerEvents="none">
      <View style={[styles.small, {left: (side - SMALL) / 2, top: (side - SMALL) / 2, transform: [{scale: side / SMALL}]}]}>
        <Image
          source={{uri}}
          style={styles.small}
          resizeMode="cover"
          resizeMethod="resize"
          blurRadius={BLUR}
          onLoad={onLoad}
          fadeDuration={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {overflow: 'hidden'},
  small: {
    position: 'absolute',
    width: SMALL,
    height: SMALL,
  },
});
