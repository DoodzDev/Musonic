/**
 * @file GlassSurface.tsx
 * @description Design v2 glass (dock, mini player, floating bars, top bars):
 *   a dark tint, a light edge and a drop shadow, over a live blur where it is
 *   cheap. On Android the blur library redraws everything behind the surface
 *   on the CPU every frame: with the Dock over a scrolling list, 100 % of
 *   frames were janky (2 % without blur). Performance comes first, so Android
 *   uses a near-opaque "frosted" surface instead, unless a surface opts into
 *   `liveBlur` over content that does not move. iOS keeps the native blur.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Platform, StyleSheet, View, type ViewProps} from 'react-native';
import {BlurView, ProgressiveBlurView} from '@sbaiahmed1/react-native-blur';
import LinearGradient from 'react-native-linear-gradient';
import {colors, radii, shadows, GLASS_BLUR} from '../../theme';

/** Same colour at zero alpha: fading to plain `transparent` greys the gradient. */
function clear(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, '0)');
}
const TINT_FADE = [colors.glassTint, colors.glassTint, clear(colors.glassTint)];
const FALLBACK_FADE = [colors.glassFallback, colors.glassFallback, clear(colors.glassFallback)];

/** iOS blurs on the GPU; Android only on request, and from Android 12 (API 31). */
const IOS = Platform.OS === 'ios';
const ANDROID_CAN_BLUR = Platform.OS === 'android' && Number(Platform.Version) >= 31;

function useReduceTransparency(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setEnabled, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setEnabled);
    return () => sub.remove();
  }, []);
  return enabled;
}

type Props = ViewProps & {
  /** Corner radius; floating glass is a capsule by default. */
  radius?: number;
  /**
   * `floating` (default): drop shadow and light edge, for capsules.
   * `bar`: flat, for full-width bars pinned to a screen edge.
   * `fade`: top bar whose blur and tint fade out towards the bottom edge,
   *   so content scrolls under it without a hard line.
   */
  variant?: 'floating' | 'bar' | 'fade';
  /** `fade` only: share of the height (0-1) kept fully frosted before fading. */
  solidRatio?: number;
  /**
   * Android: blur live even though it costs a full redraw per frame. Only for
   * surfaces over content that never scrolls or animates behind them.
   */
  liveBlur?: boolean;
};

export default function GlassSurface({
  radius = radii.capsule,
  variant = 'floating',
  solidRatio = 0.5,
  liveBlur = false,
  style,
  children,
  ...rest
}: Props) {
  const reduceTransparency = useReduceTransparency();
  const blur = !reduceTransparency && (IOS || (liveBlur && ANDROID_CAN_BLUR));
  const floating = variant === 'floating';
  const shape = {borderRadius: floating ? radius : 0};

  if (variant === 'fade') {
    const locations = [0, solidRatio, 1];
    return (
      <View {...rest} style={style}>
        {blur ? (
          <ProgressiveBlurView
            blurType="systemUltraThinMaterialDark"
            blurAmount={GLASS_BLUR}
            direction="blurredTopClearBottom"
            startOffset={solidRatio}
            reducedTransparencyFallbackColor={colors.glassFallback}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={blur ? TINT_FADE : FALLBACK_FADE}
          locations={locations}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  return (
    <View {...rest} style={[shape, floating && shadows.glass, style]}>
      {blur ? (
        <>
          <BlurView
            blurType="systemUltraThinMaterialDark"
            blurAmount={GLASS_BLUR}
            reducedTransparencyFallbackColor={colors.glassFallback}
            style={[StyleSheet.absoluteFill, shape, styles.clip]}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.tint]} />
        </>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.fallback]} />
      )}
      {floating ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, shadows.glassEdge]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  tint: {backgroundColor: colors.glassTint},
  fallback: {backgroundColor: colors.glassFallback},
});
