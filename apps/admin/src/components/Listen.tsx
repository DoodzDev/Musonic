/**
 * @file Listen.tsx
 * @description The button to listen to a library file (the page's player is in listen.ts).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { Icon } from '@musonic/icons';
import { t } from '../i18n/index.ts';

export function ListenButton({ fileId, playing, onToggle, label = t.library.listen, primary = false }: { fileId: string; playing: string | null; onToggle: (id: string) => void; label?: string; primary?: boolean }) {
  const on = playing === fileId;
  return (
    <button
      type="button"
      className={'btn sm' + (primary ? ' primary' : '')}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(fileId);
      }}
    >
      <Icon name={on ? 'pause' : 'play'} size={14} /> {on ? t.library.stop : label}
    </button>
  );
}
