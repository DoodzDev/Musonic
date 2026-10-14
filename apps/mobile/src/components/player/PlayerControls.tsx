/**
 * @file PlayerControls.tsx
 * @description Main transport of the full player (Design v2, R4.1): large
 *   previous / play-pause / next glyphs from the shared icon set, no circle
 *   behind them.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import {NextIcon, PauseIcon, PlayIcon, PrevIcon} from '../icons';
import {useT} from '../../i18n';

type Props = {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Landscape: slightly smaller glyphs. */
  compact?: boolean;
};

export default function PlayerControls({isPlaying, onTogglePlay, onPrev, onNext, compact}: Props) {
  const t = useT();
  const skip = compact ? 32 : 38;
  const play = compact ? 46 : 54;
  return (
    <View style={styles.row}>
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
  playBtn: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
