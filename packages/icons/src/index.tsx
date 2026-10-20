/**
 * @file index.tsx
 * @description Musonic's icons for web apps (console, Musonic Web): the mobile app's artwork,
 *   generated into icons.ts (`python3 packages/icons/scripts/generate.py`). Usage:
 *   `<Icon name="person" size={18} />`; the colour follows the text (currentColor).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { icons, type IconName } from './icons.ts';

export { icons, type IconName };

interface Props {
  name: IconName;
  size?: number;
  /** Any CSS colour; the text colour by default. */
  color?: string;
  className?: string;
  /** Read by screen readers; decorative (hidden) without it. */
  label?: string;
}

export function Icon({ name, size = 20, color, className, label }: Props) {
  const icon = icons[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      className={className}
      style={color ? { color } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
