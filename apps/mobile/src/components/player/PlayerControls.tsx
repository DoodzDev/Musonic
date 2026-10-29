/**
 * @file PlayerControls.tsx
 * @description Main transport of the full player (Design v2, R4.1): large
 *   previous / play-pause / next glyphs from the shared icon set, no circle
 *   behind them.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import Text from '../ui/Text';
import {NextIcon, PauseIcon, PlayIcon, PrevIcon} from '../icons';
import {useT} from '../../i18n';

type Props = {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Landscape: slightly smaller glyphs. */
  compact?: boolean;
  /** A podcast episode (ADR-023): −15 s before Previous, +30 s after Next. */
  jumps?: {onBack: () => void; onForward: () => void; backLabel: string; forwardLabel: string};
};

export default function PlayerControls({isPlaying, onTogglePlay, onPrev, onNext, compact, jumps}: Props) {
  const t = useT();
  const skip = compact ? 32 : 38;
  const play = compact ? 46 : 54;
  return (
    <View style={styles.row}>
      {jumps ? (
        <PressableScale onPress={jumps.onBack} haptic="light" scaleTo={0.88} style={styles.jumpBtn} accessibilityLabel={jumps.backLabel}>
          <Text variant="headline" style={styles.jump}>−15</Text>
        </PressableScale>
      ) : null}
      <PressableScale onPress={onPrev} haptic="light" scaleTo={0.88} style={styles.skipBtn} accessibilityLabel={t.fullScreenPlayer.previous}>
        <PrevIcon size={skip} color="#FFFFFF" />
      </PressableScale>
      <PressableScale
        onPress={onTogglePlay}
        haptic="light"
        scaleTo={0.88}
        style={styles.playBtn}
        accessibilityLabel={isPlaying ? t.fullScreenPlayer.pause : t.fullScreenPlayer.play}>
        {isPlaying ? <PauseIcon size={play} color="#FFFFFF" /> : <PlayIcon size={play} color="#FFFFFF" />}
      </PressableScale>
      <PressableScale onPress={onNext} haptic="light" scaleTo={0.88} style={styles.skipBtn} accessibilityLabel={t.fullScreenPlayer.next}>
        <NextIcon size={skip} color="#FFFFFF" />
      </PressableScale>
      {jumps ? (
        <PressableScale onPress={jumps.onForward} haptic="light" scaleTo={0.88} style={styles.jumpBtn} accessibilityLabel={jumps.forwardLabel}>
          <Text variant="headline" style={styles.jump}>+30</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  skipBtn: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpBtn: {
    width: 52,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jump: {color: '#FFFFFF', fontVariant: ['tabular-nums']},
  playBtn: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
