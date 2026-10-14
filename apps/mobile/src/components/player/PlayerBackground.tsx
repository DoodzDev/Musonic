/**
 * @file PlayerBackground.tsx
 * @description Full player background (Design v2): the cover itself, extremely
 *   blurred and slightly darkened, kept square (never stretched) and centred
 *   on the cover. It is enlarged past the screen width in portrait, past the
 *   screen height in landscape, and its edges fade out into a plain colour
 *   taken from the cover, which fills the rest of the screen. Cheap on
 *   purpose: the cover is decoded at a tiny size, blurred once on that small
 *   bitmap, then scaled up by the GPU, whose smoothing does the rest. A new
 *   cover fades in over the previous one. The darkening adapts to the
 *   brightness of the cover's main colours: light covers are darkened more so
 *   white text stays readable. Without a cover, a radial wash of the cover
 *   colour is drawn instead.
 * @author DoodzProg
 * @version 3.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, Image, StyleSheet, View} from 'react-native';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import ImageColors from 'react-native-image-colors';
import {getCoverArtUrl} from '../../api/client';
import {backdropDim} from '../../utils/backdrop';

const BASE = '#0A0A0B';
/** Size (pt) at which the cover is decoded and blurred before being scaled up. */
const SMALL = 32;
/** Blur radius applied on the small bitmap: extreme once scaled up. */
const BLUR = 6;
/** Size asked from the server: a few times SMALL, enough for the decoder. */
const REMOTE_SIZE = 96;
const FADE_MS = 450;
/** Side of the blurred square, relative to the screen width (portrait) or height (landscape). */
const EXTEND = 1.3;
/** Share of the square's half-side that stays fully opaque before fading into the fill colour. */
const SOLID_UNTIL = 0.5;
/** Darkening used when the cover's colours are unknown. */
const DEFAULT_DIM = 0.45;

export type Point = {x: number; y: number};

type Layer = {
  key: string;
  uri: string;
  /** Plain colour of the cover (its average), around the blurred square. */
  fill: string;
  dim: number;
  opacity: Animated.Value;
};

/** Mask of the square: opaque centre, edges fading to transparent (a soft disc). */
function SoftEdgeMask({side}: {side: number}) {
  return (
    <Svg width={side} height={side}>
      <Defs>
        <RadialGradient id="softEdge" cx={side / 2} cy={side / 2} r={side / 2} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000" stopOpacity={1} />
          <Stop offset={SOLID_UNTIL} stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={side} height={side} fill="url(#softEdge)" />
    </Svg>
  );
}

function BlurredCover({layer, width, height, center, onLoad}: {
  layer: Layer;
  width: number;
  height: number;
  center: Point;
  onLoad: () => void;
}) {
  // Square, never stretched: as wide as the screen in portrait, as tall in landscape, plus a margin.
  const side = (width > height ? height : width) * EXTEND;
  const scale = side / SMALL;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, {backgroundColor: layer.fill, opacity: layer.opacity}]}>
      <MaskedView
        style={[styles.square, {width: side, height: side, left: center.x - side / 2, top: center.y - side / 2}]}
        maskElement={<SoftEdgeMask side={side} />}>
        <View style={[styles.small, {left: (side - SMALL) / 2, top: (side - SMALL) / 2, transform: [{scale}]}]}>
          <Image
            source={{uri: layer.uri}}
            style={styles.smallImage}
            resizeMode="cover"
            resizeMethod="resize"
            blurRadius={BLUR}
            onLoad={onLoad}
            fadeDuration={0}
          />
        </View>
      </MaskedView>
      <View style={[StyleSheet.absoluteFill, styles.dim, {opacity: layer.dim}]} />
    </Animated.View>
  );
}

function TintFallback({tint, width, height}: {tint: string; width: number; height: number}) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="playerTint" cx={width / 2} cy={0} rx={width * 1.4} ry={height * 0.85} fx={width / 2} fy={0} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={tint} stopOpacity={1} />
          <Stop offset="0.5" stopColor={tint} stopOpacity={0.35} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#playerTint)" />
    </Svg>
  );
}

type Props = {
  coverArtId?: string;
  /** Cover colour, used when the track has no cover. */
  tint: string;
  /** Centre of the cover in the player, so the blurred square sits right behind it. */
  center?: Point;
};

function PlayerBackground({coverArtId, tint, center}: Props) {
  // Sized from its own layout, so it follows rotations.
  const [size, setSize] = useState({w: 0, h: 0});
  const [layers, setLayers] = useState<Layer[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (!coverArtId) { setLayers([]); return; }
    let uri: string;
    try { uri = getCoverArtUrl(coverArtId, REMOTE_SIZE); } catch { return; }
    counter.current += 1;
    const key = `${coverArtId}-${counter.current}`;
    let cancelled = false;
    const addLayer = (fill: string, dim: number) => {
      if (cancelled) return;
      setLayers(prev => [...prev.slice(-1), {key, uri, fill, dim, opacity: new Animated.Value(0)}]);
    };
    // Colours first (cached), so the fill colour and the darkening come with the cover.
    ImageColors.getColors(uri, {cache: true, key: uri})
      .then(result => {
        const average = result.platform === 'android' ? result.average
          : result.platform === 'ios' ? result.background
          : undefined;
        // The colour covering most of the cover (dominant) matters most for the darkening: a cream
        // cover with a dark centre averages to mid grey but still shows cream behind the header.
        const main = result.platform === 'android' ? [result.dominant, result.average]
          : result.platform === 'ios' ? [result.background, result.primary]
          : [];
        const known = main.filter((c): c is string => !!c);
        addLayer(average ?? BASE, known.length > 0 ? Math.max(...known.map(backdropDim)) : DEFAULT_DIM);
      })
      .catch(() => addLayer(BASE, DEFAULT_DIM));
    return () => { cancelled = true; };
  }, [coverArtId]);

  const onLayerLoad = (layer: Layer) => {
    Animated.timing(layer.opacity, {toValue: 1, duration: FADE_MS, useNativeDriver: true}).start(() => {
      // Once the new cover is fully shown, the ones underneath can go.
      setLayers(prev => (prev[prev.length - 1] === layer ? [layer] : prev));
    });
  };

  const at = center ?? {x: size.w / 2, y: size.h * 0.35};

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.base]}
      pointerEvents="none"
      onLayout={e => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
      {size.w > 0 && (
        <>
          {/* Under the covers: shown while the first cover loads, or if it cannot. */}
          <TintFallback tint={tint} width={size.w} height={size.h} />
          {layers.map(layer => (
            <BlurredCover
              key={layer.key}
              layer={layer}
              width={size.w}
              height={size.h}
              center={at}
              onLoad={() => onLayerLoad(layer)}
            />
          ))}
          {/* Darker towards the controls so white text stays readable. */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
    </View>
  );
}

export default React.memo(PlayerBackground);

const styles = StyleSheet.create({
  base: {backgroundColor: BASE},
  square: {position: 'absolute'},
  small: {
    position: 'absolute',
    width: SMALL,
    height: SMALL,
  },
  smallImage: {
    width: SMALL,
    height: SMALL,
  },
  dim: {backgroundColor: '#000'},
});
