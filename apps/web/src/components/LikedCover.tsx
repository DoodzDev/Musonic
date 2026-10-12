/**
 * @file LikedCover.tsx
 * @description Liked Songs artwork, same as the mobile Library: violet-to-blue gradient with a white heart.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { LIKED_GRADIENT } from '../theme/tokens.ts';
import { HeartIcon } from './icons/HeartIcon.tsx';

interface Props {
  /** Displayed size, used to scale the heart (45 % of the cover, as on mobile). */
  size: number;
  className?: string;
}

export function LikedCover({ size, className }: Props) {
  return (
    <span className={`cover cover-liked${className ? ` ${className}` : ''}`} style={{ background: LIKED_GRADIENT }}>
      <HeartIcon size={Math.round(size * 0.45)} color="#fff" filled />
    </span>
  );
}
