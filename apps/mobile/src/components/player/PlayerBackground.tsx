/**
 * @file PlayerBackground.tsx
 * @description Full player background (Design v2): the cover itself, extremely
 *   blurred and slightly darkened, kept square (never stretched) and centred
 *   on the cover. It is enlarged past the screen width in portrait, past the
 *   screen height in landscape, and its edges fade out into a plain colour
 *   taken from the cover, which fills the rest of the screen. Cheap: the
 *   blurred square is a `BlurredCover` (tiny bitmap scaled up). A new
 *   cover fades in over the previous one. The darkening adapts to the
 *   brightness of the cover's main colours: light covers are darkened more so
 *   white text stays readable. Without a cover, a radial wash of the cover
 *   colour is drawn instead.
 * @author DoodzProg
 * @version 3.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import {getCoverArtUrl} from '../../api/client';
import {coverTone} from '../../services/coverTone';
import BlurredCover, {BLURRED_COVER_SOURCE_SIZE} from '../ui/BlurredCover';

const BASE = '#0A0A0B';
const FADE_MS = 450;
/** Side of the blurred square, relative to the screen width (portrait) or height (landscape). */
const EXTEND = 1.3;
/** Share of the square's half-side that stays fully opaque before fading into the fill colour. */
const SOLID_UNTIL = 0.5;

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

function CoverLayer({layer, width, height, center, onLoad}: {
  layer: Layer;
  width: number;
  height: number;
  center: Point;
  onLoad: () => void;
}) {
  // Square, never stretched: as wide as the screen in portrait, as tall in landscape, plus a margin.
  const side = (width > height ? height : width) * EXTEND;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, {backgroundColor: layer.fill, opacity: layer.opacity}]}>
      <MaskedView
        style={[styles.square, {width: side, height: side, left: center.x - side / 2, top: center.y - side / 2}]}
        maskElement={<SoftEdgeMask side={side} />}>
        <BlurredCover uri={layer.uri} side={side} onLoad={onLoad} />
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
    try { uri = getCoverArtUrl(coverArtId, BLURRED_COVER_SOURCE_SIZE); } catch { return; }
    counter.current += 1;
    const key = `${coverArtId}-${counter.current}`;
    let cancelled = false;
    // Colours first (cached), so the fill colour and the darkening come with the cover.
    coverTone(uri).then(({fill, dim}) => {
      if (cancelled) return;
      setLayers(prev => [...prev.slice(-1), {key, uri, fill, dim, opacity: new Animated.Value(0)}]);
    });
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
            <CoverLayer
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
  dim: {backgroundColor: '#000'},
});
