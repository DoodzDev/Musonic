/**
 * @file CoverWash.tsx
 * @description A heavily zoomed, extremely blurred piece of a cover that
 *   fills a surface from its left edge and fades out towards the right (the
 *   mini player capsule). Darkened from the cover's own colours so white text
 *   on it stays readable. Fades in when the cover changes.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import LinearGradient from 'react-native-linear-gradient';
import BlurredCover from './BlurredCover';
import {coverTone, DEFAULT_TONE} from '../../services/coverTone';

/** Side of the blurred square relative to the surface width: a zoomed-in piece of the cover. */
const ZOOM = 0.75;
/** Horizontal mask: opaque on the left, gone past ~3/4 of the width. */
const MASK_COLORS = ['#000', '#000', 'transparent'];
const MASK_STOPS = [0, 0.3, 0.78];
const FADE_MS = 400;
/** Extra darkening over the player's: the capsule's grey secondary text must stay readable too. */
const EXTRA_DIM = 0.12;

type Props = {
  /** Small cover image (see BLURRED_COVER_SOURCE_SIZE); none = nothing drawn. */
  uri?: string;
};

function Wash({uri, width, height}: {uri: string; width: number; height: number}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [dim, setDim] = useState(DEFAULT_TONE.dim + EXTRA_DIM);

  useEffect(() => {
    let cancelled = false;
    coverTone(uri).then(tone => { if (!cancelled) setDim(Math.min(0.8, tone.dim + EXTRA_DIM)); });
    return () => { cancelled = true; };
  }, [uri]);

  const side = width * ZOOM;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, {opacity}]}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={MASK_COLORS}
            locations={MASK_STOPS}
            start={{x: 0, y: 0.5}}
            end={{x: 1, y: 0.5}}
            style={StyleSheet.absoluteFill}
          />
        }>
        {/* Centred vertically on the surface: its middle band shows, very enlarged. */}
        <View style={[styles.square, {top: (height - side) / 2}]}>
          <BlurredCover
            uri={uri}
            side={side}
            onLoad={() => Animated.timing(opacity, {toValue: 1, duration: FADE_MS, useNativeDriver: true}).start()}
          />
        </View>
        <View style={[StyleSheet.absoluteFill, styles.dim, {opacity: dim}]} />
      </MaskedView>
    </Animated.View>
  );
}

export default function CoverWash({uri}: Props) {
  const [size, setSize] = useState({w: 0, h: 0});
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={e => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
      {uri && size.w > 0 && <Wash key={uri} uri={uri} width={size.w} height={size.h} />}
    </View>
  );
}

const styles = StyleSheet.create({
  square: {position: 'absolute', left: 0},
  dim: {backgroundColor: '#000'},
});
