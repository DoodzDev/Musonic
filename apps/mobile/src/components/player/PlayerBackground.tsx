/**
 * @file PlayerBackground.tsx
 * @description Full player background (Design v2, R4.1): a radial wash of the
 *   cover's colour from the top, fading to near black. A static SVG gradient:
 *   much cheaper than the former blurred copy of the cover. Sized from its own
 *   layout, so it follows rotations (a percentage-sized SVG kept its first size).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';

const BASE = '#0A0A0B';

function PlayerBackground({tint}: {tint: string}) {
  const [size, setSize] = useState({w: 0, h: 0});
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.base]}
      pointerEvents="none"
      onLayout={e => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient
              id="playerTint"
              cx={size.w / 2}
              cy={0}
              rx={size.w * 1.4}
              ry={size.h * 0.85}
              fx={size.w / 2}
              fy={0}
              gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={tint} stopOpacity={1} />
              <Stop offset="0.5" stopColor={tint} stopOpacity={0.35} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#playerTint)" />
        </Svg>
      )}
    </View>
  );
}

export default React.memo(PlayerBackground);

const styles = StyleSheet.create({
  base: {backgroundColor: BASE},
});
