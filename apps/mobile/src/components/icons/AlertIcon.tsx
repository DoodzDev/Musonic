/**
 * @file AlertIcon.tsx
 * @description Exclamation mark, bare or inside a triangle: signals a failed
 *   action or a warning.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string; strokeWidth?: number; triangle?: boolean};

export default function AlertIcon({size = 24, color = '#fff', strokeWidth = 2, triangle = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {triangle ? (
        <Path
          d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill="none"
        />
      ) : null}
      <Path
        d={triangle ? 'M12 9v4M12 17h.01' : 'M12 6v8M12 18.5h.01'}
        stroke={color}
        strokeWidth={triangle ? strokeWidth : strokeWidth + 0.6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
