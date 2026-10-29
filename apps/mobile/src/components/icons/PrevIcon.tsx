/**
 * @file PrevIcon.tsx
 * @description Skip-to-previous playback icon: NextIcon mirrored (drawn as such, so the web
 *   icon set gets it too).
 * @author DoodzProg
 * @version 3.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PrevIcon({size = 32, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 5.3v13.4a1 1 0 0 1-1.55.83l-10-6.7a1 1 0 0 1 0-1.66l10-6.7A1 1 0 0 1 20 5.3z" fill={color} />
      <Path d="M4 5.25a1.25 1.25 0 0 1 2.5 0v13.5a1.25 1.25 0 0 1-2.5 0z" fill={color} />
    </Svg>
  );
}
