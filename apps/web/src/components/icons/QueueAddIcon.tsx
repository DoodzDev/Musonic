/**
 * @file QueueAddIcon.tsx
 * @description Add to queue icon: the mobile app's artwork, from the shared icon set
 *   (@musonic/icons), so it is the same glyph on every Musonic client.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import { Icon } from '@musonic/icons';

type Props = {size?: number; color?: string};

export function QueueAddIcon({size = 24, color = '#B3B3B3'}: Props) {
  return <Icon name="queue-add" size={size} color={color} />;
}
