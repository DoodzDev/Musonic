/**
 * @file NextIcon.tsx
 * @description Skip-to-next playback icon (Design v2): two rounded triangles,
 *   the same glyph everywhere (full player, Dock, lyrics).
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

/** Shared with PrevIcon, which mirrors it. */
export const SKIP_PATH =
  'M3 6.2v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4L4.2 5.5A.8.8 0 0 0 3 6.2zm9.5 0v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4l-8.3-5.8a.8.8 0 0 0-1.2.7z';

export default function NextIcon({size = 32, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={SKIP_PATH} fill={color} />
    </Svg>
  );
}
