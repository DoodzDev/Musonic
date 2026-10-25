/**
 * @file SleepTimerButton.tsx
 * @description Clock button of the player bar and the full player: opens the
 *   sleep timer; orange with a dot while one is set, its title says what is left.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { tr } from '../i18n/index.ts';
import { secondsLeft, useSleepTimer } from '../player/sleepTimer.ts';
import { colors } from '../theme/tokens.ts';
import { SleepTimerDialog } from './SleepTimerDialog.tsx';
import { ClockIcon } from './icons/ClockIcon.tsx';

export function SleepTimerButton({ size = 20, className = 'icon-btn icon-mode' }: { size?: number; className?: string }) {
  const t = tr.sleepTimer;
  const { endsAt, endOfTrack } = useSleepTimer();
  const [open, setOpen] = useState(false);
  const active = endsAt !== null || endOfTrack;
  // Read when the pointer comes over the button: the title then says the time left.
  const [, setHover] = useState(0);
  const label = endsAt !== null ? t.active(t.duration(secondsLeft(endsAt))) : endOfTrack ? t.active(t.endShort) : t.button;

  return (
    <>
      <button
        type="button"
        className={className + (active ? ' is-on' : '')}
        onClick={() => setOpen(true)}
        onPointerEnter={() => setHover((n) => n + 1)}
        aria-label={label}
        aria-pressed={active}
        title={label}>
        <ClockIcon size={size} color={active ? colors.accent : 'currentColor'} />
        {active && <span className="icon-dot" />}
      </button>
      {open && <SleepTimerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
