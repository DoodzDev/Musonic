/**
 * @file PlayerControls.tsx
 * @description Pieces shared by the player bar, the full-screen player and the
 *   mini player: transport buttons (shuffle, previous, play, next, repeat),
 *   progress bar with times, and volume.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { tr } from '../i18n/index.ts';
import { formatTime } from '../lib/format.ts';
import { useTransport } from '../player/transport.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { usePosition } from '../player/position.ts';
import { VolumeIcon } from './Icons.tsx';
import { Slider } from './Slider.tsx';
import { NextIcon } from './icons/NextIcon.tsx';
import { PauseIcon } from './icons/PauseIcon.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';
import { PrevIcon } from './icons/PrevIcon.tsx';
import { RepeatIcon } from './icons/RepeatIcon.tsx';
import { ShuffleIcon } from './icons/ShuffleIcon.tsx';

const t = tr.player;

/** `size` scales the buttons: 1 = player bar, larger in the full-screen player. */
export function TransportButtons({ size = 1, modes = true }: { size?: number; modes?: boolean }) {
  const player = usePlayer();
  const transport = useTransport();
  const { current: song, hasNext, playing } = player;
  const shuffleLabel = t.shuffle[player.modes.shuffle];
  const repeatLabel = t.repeat[player.modes.repeat];
  const px = (n: number) => Math.round(n * size);

  return (
    <div className="player-controls" style={size !== 1 ? { gap: px(14) } : undefined}>
      {modes && (
        <button type="button" className="ctrl ctrl-mode" onClick={player.cycleShuffle} aria-label={shuffleLabel} title={shuffleLabel}>
          <ShuffleIcon mode={player.modes.shuffle} size={px(20)} />
        </button>
      )}
      <button type="button" className="ctrl" onClick={transport.previous} disabled={!song} aria-label={t.previous} title={`${t.previous} (Ctrl ←)`}>
        <PrevIcon size={px(24)} />
      </button>
      <button
        type="button"
        className="ctrl ctrl-main"
        style={size !== 1 ? { width: px(40), height: px(40), borderRadius: px(20) } : undefined}
        onClick={transport.togglePlay}
        disabled={!song}
        aria-label={playing ? t.pause : t.play}
        title={`${playing ? t.pause : t.play} (${t.keySpace})`}>
        {playing ? <PauseIcon size={px(20)} color="currentColor" /> : <PlayIcon size={px(20)} color="currentColor" />}
      </button>
      <button type="button" className="ctrl" onClick={player.next} disabled={!hasNext} aria-label={t.next} title={`${t.next} (Ctrl →)`}>
        <NextIcon size={px(24)} />
      </button>
      {modes && (
        <button type="button" className="ctrl ctrl-mode" onClick={player.cycleRepeat} aria-label={repeatLabel} title={repeatLabel}>
          <RepeatIcon mode={player.modes.repeat} size={px(20)} />
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ times = true }: { times?: boolean }) {
  const { current: song } = usePlayer();
  const { duration, seek } = useTransport();
  const position = usePosition();
  return (
    <div className="progress">
      {times && <span className="time time-left">{formatTime(position)}</span>}
      <Slider
        value={position}
        max={duration}
        step={0.1}
        label={t.position}
        valueText={`${formatTime(position)} / ${formatTime(duration)}`}
        disabled={!song}
        onChange={seek}
      />
      {times && <span className="time">{formatTime(duration)}</span>}
    </div>
  );
}

export function VolumeControl() {
  const { volume, muted, setVolume, setMuted } = useTransport();
  const shown = muted ? 0 : volume;
  return (
    <>
      <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? t.unmute : t.mute}>
        <VolumeIcon muted={muted || volume === 0} />
      </button>
      <Slider
        className="track-volume"
        value={shown}
        max={1}
        step={0.01}
        label={t.volume}
        valueText={`${Math.round(shown * 100)} %`}
        onChange={(v) => {
          setVolume(v);
          setMuted(false);
        }}
      />
      <span className="volume-pct" aria-hidden="true">{Math.round(shown * 100)} %</span>
    </>
  );
}
