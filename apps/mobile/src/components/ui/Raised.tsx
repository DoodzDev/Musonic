/**
 * @file Raised.tsx
 * @description Design v2 "relief": a surface with a soft drop shadow and a
 *   fine light edge, like the mini player's glass, so covers, tiles and cards
 *   read as slightly 3D, pressable objects. The edge sits on an overlay above
 *   the content (inset shadows draw under children). Neutral only: never a
 *   coloured glow.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {shadows} from '../../theme';

type Props = {
  /** Corner radius of the surface (a circle: half its size). */
  radius: number;
  /** Shadow under the surface; off for surfaces already lifted by their parent. */
  shadow?: boolean;
  /**
   * The content fills a surface sized by `style` (tiles, cards with absolutely
   * placed layers). Off by default: the surface then fits its content (covers, avatars).
   */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function Raised({radius, shadow = true, fill = false, style, children}: Props) {
  return (
    <View style={[{borderRadius: radius}, shadow && shadows.raised, style]}>
      <View style={[styles.clip, fill && styles.fill, {borderRadius: radius}]}>{children}</View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, {borderRadius: radius}, shadows.raisedEdge]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  fill: {flex: 1},
});
