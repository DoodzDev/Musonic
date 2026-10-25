/**
 * @file SleepTimerDialog.tsx
 * @description Sleep timer, as in the mobile app: any duration on hours /
 *   minutes / seconds wheels (one wheel notch or arrow key = one number, a
 *   click on a visible number picks it), quick presets, the end of the
 *   current track, or off; shows what is set.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../i18n/index.ts';
import { secondsLeft, setSleepTimer, useSleepTimer } from '../player/sleepTimer.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';

const PRESETS = [15, 30, 45, 60, 90];
const ROW = 36;

/** Last custom duration, kept until the page reloads (30 min the first time). */
let lastCustom = { h: 0, m: 30, s: 0 };

/** A column of numbers that snaps on one, like a phone's timer. */
function Wheel({ max, value, onChange, unit, label }: { max: number; value: number; onChange: (v: number) => void; unit: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  /** Selects a number and brings it to the band. */
  function select(next: number) {
    const v = Math.min(max, Math.max(0, next));
    ref.current?.scrollTo({ top: v * ROW, behavior: 'smooth' });
    latest.current.onChange(v);
  }
  const selectRef = useRef(select);
  selectRef.current = select;

  // Start on the value; then the scroll position is the value.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ROW;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  // One mouse wheel notch = one number, however far the wheel scrolls (some report several
  // rows a notch); a touchpad's small moves add up to a step.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sum = 0;
    let lastStep = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      if (Math.abs(event.deltaY) >= 40) {
        if (now - lastStep < 80) return;
        lastStep = now;
        sum = 0;
        selectRef.current(latest.current.value + Math.sign(event.deltaY));
        return;
      }
      sum += event.deltaY;
      if (Math.abs(sum) >= 30) {
        selectRef.current(latest.current.value + Math.sign(sum));
        sum = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onScroll() {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (el) latest.current.onChange(Math.min(max, Math.max(0, Math.round(el.scrollTop / ROW))));
    }, 90);
  }

  return (
    <div className="wheel">
      <div
        ref={ref}
        className="wheel-list"
        onScroll={onScroll}
        tabIndex={0}
        role="spinbutton"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); select(value - 1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); select(value + 1); }
        }}>
        {Array.from({ length: max + 1 }, (_, i) => (
          <div key={i} className={'wheel-row' + (i === value ? ' is-on' : '')} onClick={() => select(i)}>
            {String(i).padStart(2, '0')}
          </div>
        ))}
      </div>
      <span className="wheel-unit">{unit}</span>
    </div>
  );
}

export function SleepTimerDialog({ onClose }: { onClose: () => void }) {
  const t = tr.sleepTimer;
  const { endsAt, endOfTrack } = useSleepTimer();
  const active = endsAt !== null || endOfTrack;
  const [h, setH] = useState(lastCustom.h);
  const [m, setM] = useState(lastCustom.m);
  const [s, setS] = useState(lastCustom.s);
  const total = h * 3600 + m * 60 + s;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (choice: number | 'track' | null) => {
    setSleepTimer(choice);
    onClose();
  };

  return (
    <div className="dialog-backdrop sleep-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog sleep-dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{t.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr.common.close} title={tr.common.close}>
            <CloseIcon size={20} />
          </button>
        </div>
        {active && (
          <p className="sleep-status">{endsAt !== null ? t.stopsIn(t.duration(secondsLeft(endsAt))) : t.stopsAtEnd}</p>
        )}
        <div className="wheels">
          <div className="wheels-band" aria-hidden="true" />
          <Wheel max={23} value={h} onChange={setH} unit={t.hours} label={t.hours} />
          <Wheel max={59} value={m} onChange={setM} unit={t.minutes} label={t.minutes} />
          <Wheel max={59} value={s} onChange={setS} unit={t.seconds} label={t.seconds} />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={total === 0}
          onClick={() => {
            lastCustom = { h, m, s };
            choose(total);
          }}>
          {total > 0 ? t.start(t.duration(total)) : t.pickDuration}
        </button>
        <div className="sleep-presets">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => choose(p * 60)}>{t.duration(p * 60)}</button>
          ))}
        </div>
        <div className="sleep-more">
          <button type="button" className={'chip' + (endOfTrack ? ' is-on' : '')} onClick={() => choose('track')}>{t.endOfTrack}</button>
          {active && <button type="button" className="btn-quiet sleep-off" onClick={() => choose(null)}>{t.off}</button>}
        </div>
      </div>
    </div>
  );
}
