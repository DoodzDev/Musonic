/**
 * @file PlayIcon.tsx
 * @description Play icon: the mobile app's artwork, from the shared icon set
 *   (@musonic/icons), so it is the same glyph on every Musonic client.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import { Icon } from '@musonic/icons';

type Props = {size?: number; color?: string};

export function PlayIcon({size = 22, color = '#000'}: Props) {
  return <Icon name="play" size={size} color={color} />;
}
