/**
 * @file PlayerActionsRow.tsx
 * @description Bottom row of the full player (Design v2, R4.2): Lyrics ·
 *   Shuffle (off / on / Magic) · Repeat (all / one) · Queue, drawn with the
 *   shared icons. An active mode (lyrics shown, shuffle, repeat) is drawn in
 *   the accent colour on a light fill.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import Text from '../ui/Text';
import {LyricsIcon, QueueIcon, RepeatIcon, ShuffleIcon} from '../icons';
import {colors} from '../../theme/tokens';
import {useT} from '../../i18n';
import type {RepeatModeUI, ShuffleMode} from '../../store/playerStore';

const ON_FILL = 'rgba(255,255,255,0.16)';
const DIM = 'rgba(255,255,255,0.7)';

type Props = {
  lyricsAvailable: boolean;
  /** Lyrics shown in place of the cover. */
  lyricsActive: boolean;
  onLyrics: () => void;
  shuffleMode: ShuffleMode;
  isFetchingMagic: boolean;
  onShuffle: () => void;
  repeatMode: RepeatModeUI;
  onRepeat: () => void;
  onQueue: () => void;
  /** A podcast episode (ADR-023): its speed in place of Shuffle and Repeat. */
  speed?: {value: number; label: string; onPress: () => void};
};

export default function PlayerActionsRow({
  lyricsAvailable, lyricsActive, onLyrics, shuffleMode, isFetchingMagic, onShuffle, repeatMode, onRepeat, onQueue, speed}: Props) {
  const t = useT().fullScreenPlayer;
  // Always closable, even when the next track has no lyrics.
  const lyricsEnabled = lyricsAvailable || lyricsActive;
  const shuffleOn = shuffleMode !== 'off';
  const repeatOn = repeatMode !== 'none';
  const shuffleLabel = shuffleMode === 'magic' ? t.shuffleMagic : shuffleMode === 'on' ? t.shuffleOn : t.shuffleOff;
  const repeatLabel = repeatMode === 'one' ? t.repeatOne : repeatMode === 'all' ? t.repeatAll : t.repeatOff;

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onLyrics}
        disabled={!lyricsEnabled}
        haptic="selection"
        style={[styles.round, lyricsActive && styles.on, !lyricsEnabled && styles.disabled]}
        accessibilityLabel={t.lyricsTitle}
        accessibilityState={{disabled: !lyricsEnabled, selected: lyricsActive}}>
        <LyricsIcon color={lyricsActive ? colors.accent : DIM} />
      </PressableScale>

      {speed ? (
        <PressableScale onPress={speed.onPress} haptic="selection" style={[styles.round, speed.value !== 1 && styles.on]} accessibilityLabel={`${speed.label} : ${speed.value}×`}>
          <Text variant="subhead" style={styles.speed}>{`${speed.value.toLocaleString()}×`}</Text>
        </PressableScale>
      ) : null}

      {speed ? null : (
      <PressableScale
        onPress={onShuffle}
        disabled={isFetchingMagic}
        style={[styles.round, shuffleOn && styles.on]}
        accessibilityLabel={shuffleLabel}
        accessibilityState={{busy: isFetchingMagic}}>
        {isFetchingMagic
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <ShuffleIcon mode={shuffleMode} indicator={false} />}
      </PressableScale>
      )}

      {speed ? null : (
      <PressableScale
        onPress={onRepeat}
        style={[styles.round, repeatOn && styles.on]}
        accessibilityLabel={repeatLabel}>
        <RepeatIcon mode={repeatMode} indicator={false} />
      </PressableScale>
      )}

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
  speed: {color: colors.accent, fontWeight: '600'},
});
