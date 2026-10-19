/**
 * @file Slider.tsx
 * @description Thin bar with a fill, a knob (hover / drag) and an invisible
 *   range input on top. Progress and volume of every player view.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

interface Props {
  value: number;
  max: number;
  step: number;
  label: string;
  valueText?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
}

export function Slider({ value, max, step, label, valueText, disabled, onChange, className }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={'track' + (className ? ` ${className}` : '') + (disabled ? ' is-disabled' : '')}>
      <div className="track-bg"><div className="track-fill" style={{ width: `${pct}%` }} /></div>
      <span className="track-knob" style={{ left: `${pct}%` }} aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={max || 0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        disabled={disabled}
      />
    </div>
  );
}
