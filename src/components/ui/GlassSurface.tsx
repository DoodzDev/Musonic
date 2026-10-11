/**
 * @file GlassSurface.tsx
 * @description Design v2 floating glass (dock, mini player, floating bars):
 *   live blur of what scrolls behind, a dark tint, a light edge and a drop
 *   shadow. Falls back to an opaque surface where blur is too costly (Android
 *   before 12) or when the user asked the OS to reduce transparency.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, Platform, StyleSheet, View, type ViewProps} from 'react-native';
import {BlurView} from '@sbaiahmed1/react-native-blur';
import {colors, radii, shadows, GLASS_BLUR} from '../../theme';

/** Android 12 (API 31) brought GPU blur; older phones get the opaque fallback. */
const PLATFORM_CAN_BLUR = Platform.OS !== 'android' || Number(Platform.Version) >= 31;

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
};

export default function GlassSurface({radius = radii.capsule, style, children, ...rest}: Props) {
  const reduceTransparency = useReduceTransparency();
  const blur = PLATFORM_CAN_BLUR && !reduceTransparency;
  const shape = {borderRadius: radius};

  return (
    <View {...rest} style={[shape, shadows.glass, style]}>
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
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, shadows.glassEdge]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  tint: {backgroundColor: colors.glassTint},
  fallback: {backgroundColor: colors.glassFallback},
});
