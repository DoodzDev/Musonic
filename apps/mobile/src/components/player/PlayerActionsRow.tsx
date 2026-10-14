/**
 * @file PlayerActionsRow.tsx
 * @description Bottom row of the full player (Design v2, R4.2): Lyrics ·
 *   Shuffle (off / on / Magic) · Repeat (all / one) · Queue, drawn with the
 *   shared icons. An active mode is drawn in the accent colour on a light fill.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import {LyricsIcon, QueueIcon, RepeatIcon, ShuffleIcon} from '../icons';
import {colors} from '../../theme/tokens';
import {useT} from '../../i18n';
import type {RepeatModeUI, ShuffleMode} from '../../store/playerStore';

const ON_FILL = 'rgba(255,255,255,0.16)';
const DIM = 'rgba(255,255,255,0.7)';

type Props = {
  lyricsAvailable: boolean;
  onLyrics: () => void;
  shuffleMode: ShuffleMode;
  isFetchingMagic: boolean;
  onShuffle: () => void;
  repeatMode: RepeatModeUI;
  onRepeat: () => void;
  onQueue: () => void;
};

export default function PlayerActionsRow({
  lyricsAvailable, onLyrics, shuffleMode, isFetchingMagic, onShuffle, repeatMode, onRepeat, onQueue,
}: Props) {
  const t = useT().fullScreenPlayer;
  const shuffleOn = shuffleMode !== 'off';
  const repeatOn = repeatMode !== 'none';
  const shuffleLabel = shuffleMode === 'magic' ? t.shuffleMagic : shuffleMode === 'on' ? t.shuffleOn : t.shuffleOff;
  const repeatLabel = repeatMode === 'one' ? t.repeatOne : repeatMode === 'all' ? t.repeatAll : t.repeatOff;

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onLyrics}
        disabled={!lyricsAvailable}
        style={[styles.round, !lyricsAvailable && styles.disabled]}
        accessibilityLabel={t.lyricsTitle}
        accessibilityState={{disabled: !lyricsAvailable}}>
        <LyricsIcon color={DIM} />
      </PressableScale>

      <PressableScale
        onPress={onShuffle}
        disabled={isFetchingMagic}
        haptic="selection"
        style={[styles.round, shuffleOn && styles.on]}
        accessibilityLabel={shuffleLabel}
        accessibilityState={{busy: isFetchingMagic}}>
        {isFetchingMagic
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <ShuffleIcon mode={shuffleMode} indicator={false} />}
      </PressableScale>

      <PressableScale
        onPress={onRepeat}
        haptic="selection"
        style={[styles.round, repeatOn && styles.on]}
        accessibilityLabel={repeatLabel}>
        <RepeatIcon mode={repeatMode} indicator={false} />
      </PressableScale>

      <PressableScale onPress={onQueue} style={styles.round} accessibilityLabel={t.queue}>
        <QueueIcon color={DIM} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: {backgroundColor: ON_FILL},
  disabled: {opacity: 0.35},
});
