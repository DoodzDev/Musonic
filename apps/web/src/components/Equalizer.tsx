/**
 * @file Equalizer.tsx
 * @description Now-playing equalizer, same as the mobile one: three accent bars, 3 px wide, bouncing while playing.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

interface Props {
  playing: boolean;
  label?: string;
}

export function Equalizer({ playing, label }: Props) {
  return (
    <span className={`equalizer${playing ? ' is-playing' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span />
      <span />
      <span />
    </span>
  );
}
