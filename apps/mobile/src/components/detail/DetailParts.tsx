/**
 * @file DetailParts.tsx
 * @description Shared parts of the Design v2 detail pages (album, playlist,
 *   artist, Magic Mix), so they all look and behave the same:
 *   - `DetailTopBar`: round glass Back button and optional actions pinned at
 *     the top; once the hero has scrolled away, a frosted bar fades in under
 *     them with the page title, centred;
 *   - `CoverBackdrop`: a wash of the cover's own colour behind the top of the
 *     page, fading into the black background (no glow, no shadow);
 *   - `PlayShuffleRow`: the wide Play (or Pause) button and the Shuffle button, which
 *     shows its mode (accent when on, "Magic" label in magic mode);
 *   - `RoundAction`: a round secondary action with its label below.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {Extrapolation, interpolate, useAnimatedStyle, type SharedValue} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import GlassSurface from '../ui/GlassSurface';
import PressableScale from '../ui/PressableScale';
import Text from '../ui/Text';
import {BackArrowIcon, PauseIcon, PlayIcon, ShuffleIcon} from '../icons';
import {getCoverArtUrl} from '../../api/client';
import {coverTone} from '../../services/coverTone';
import {BLURRED_COVER_SOURCE_SIZE} from '../ui/BlurredCover';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';

/** Height of the top bar below the status bar. */
export const DETAIL_BAR_HEIGHT = 52;
const ROUND = 40;
const FADE = 24;
const FADE_TAIL = 28;

/** Round glass button of the top bar. */
export function GlassButton({icon, onPress, accessibilityLabel}: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PressableScale onPress={onPress} hitSlop={4} accessibilityLabel={accessibilityLabel} style={styles.round}>
      <View style={styles.roundFill}>{icon}</View>
    </PressableScale>
  );
}

/**
 * Top bar of a detail page. `showAt`: scroll offset at which the hero is gone
 * and the frosted bar with the title fades in.
 */
export function DetailTopBar({title, scrollY, showAt, onBack, right}: {
  title: string;
  scrollY: SharedValue<number>;
  showAt: number;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [showAt - FADE, showAt], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <View pointerEvents="box-none" style={[styles.top, {paddingTop: insets.top}]}>
      <Animated.View pointerEvents="none" style={[styles.glass, {bottom: -FADE_TAIL}, barStyle]}>
        <GlassSurface
          variant="fade"
          solidRatio={(insets.top + DETAIL_BAR_HEIGHT * 0.6) / (insets.top + DETAIL_BAR_HEIGHT + FADE_TAIL)}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.bar} pointerEvents="box-none">
        <GlassButton
          icon={<BackArrowIcon size={20} color={colors.textPrimary} />}
          onPress={onBack}
          accessibilityLabel={t.common.back}
        />
        <Animated.View style={[styles.title, barStyle]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Text variant="headline" numberOfLines={1}>{title}</Text>
        </Animated.View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

/** Wash of the cover's colour behind the top of the page, fading into black. */
export function CoverBackdrop({coverId, tint, height = 520}: {
  coverId?: string;
  /** Fixed colour instead of the cover's (built-in collections). */
  tint?: string;
  height?: number;
}) {
  const [coverFill, setFill] = useState<string | null>(null);
  const fill = tint ?? coverFill;
  useEffect(() => {
    if (!coverId || tint) return;
    let uri: string;
    try { uri = getCoverArtUrl(coverId, BLURRED_COVER_SOURCE_SIZE); } catch { return; }
    let cancelled = false;
    coverTone(uri).then(tone => { if (!cancelled) setFill(tone.fill); });
    return () => { cancelled = true; };
  }, [coverId, tint]);
  if (!fill) return null;
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[fill, 'rgba(0,0,0,0)']}
      locations={[0, 1]}
      style={[styles.backdrop, {height}]}
    />
  );
}

/** Wide Play button and the Shuffle button (mode shown by its colour and label). */
export function PlayShuffleRow({onPlay, onShuffle, shuffleMode = 'off', loading, disabled, playing, playLabel, extra}: {
  onPlay: () => void;
  /** Label of the Play button when it is not "Play" (e.g. "Play all"). */
  playLabel?: string;
  /** This page is the one playing: the button pauses. */
  playing?: boolean;
  /** Without it, no Shuffle button. */
  onShuffle?: () => void;
  shuffleMode?: 'off' | 'on' | 'magic';
  loading?: boolean;
  disabled?: boolean;
  /** More square buttons after Shuffle (e.g. Edit on a playlist). */
  extra?: React.ReactNode;
}) {
  const t = useT();
  const on = shuffleMode !== 'off';
  return (
    <View style={styles.playRow}>
      <PressableScale
        onPress={onPlay}
        disabled={disabled || loading}
        haptic="light"
        accessibilityLabel={playing ? t.ui.pause : t.ui.play}
        style={[styles.play, disabled && styles.disabled]}>
        {loading
          ? <ActivityIndicator color={colors.onAccent} />
          : playing ? <PauseIcon size={16} color={colors.onAccent} /> : <PlayIcon size={16} color={colors.onAccent} />}
        <Text variant="headline" style={styles.playLabel}>{playing ? t.ui.pause : playLabel ?? t.ui.play}</Text>
      </PressableScale>
      {onShuffle ? <PressableScale
        onPress={onShuffle}
        haptic="selection"
        accessibilityLabel={t.queue.shuffleTile}
        accessibilityState={{selected: on}}
        style={[styles.square, on && styles.squareOn, shuffleMode === 'magic' && styles.squareWide]}>
        <ShuffleIcon mode={shuffleMode} size={20} color={on ? colors.accent : colors.textPrimary} />
        {shuffleMode === 'magic' ? <Text variant="subhead" style={styles.magic}>{t.ui.badgeMagic}</Text> : null}
      </PressableScale> : null}
      {extra}
    </View>
  );
}

/** Square secondary button of the Play row. */
export function SquareButton({icon, onPress, accessibilityLabel}: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.square}>
      {icon}
    </PressableScale>
  );
}

/** Round secondary action with its label below (Add, Download, More). */
export function RoundAction({icon, label, onPress, active, busy}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  /** Accent label (e.g. "Added"). */
  active?: boolean;
  busy?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityLabel={label} style={styles.action}>
      <View style={styles.actionDisc}>
        {busy ? <ActivityIndicator color={colors.accent} /> : icon}
      </View>
      <Text variant="caption" style={[styles.actionLabel, active && styles.actionActive]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  top: {position: 'absolute', top: 0, left: 0, right: 0},
  glass: {position: 'absolute', top: 0, left: 0, right: 0},
  bar: {
    height: DETAIL_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },
  title: {flex: 1, alignItems: 'center'},
  right: {minWidth: ROUND, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s},
  round: {width: ROUND, height: ROUND},
  roundFill: {
    flex: 1,
    borderRadius: ROUND / 2,
    backgroundColor: 'rgba(44,44,48,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.85},
  playRow: {flexDirection: 'row', gap: 12, paddingHorizontal: spacing.gutter},
  play: {
    flex: 1,
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  playLabel: {color: colors.onAccent},
  disabled: {opacity: 0.4},
  square: {
    minWidth: 48,
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.fill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  squareOn: {backgroundColor: colors.accentFill},
  squareWide: {paddingHorizontal: 14},
  magic: {color: colors.accent, fontWeight: '600'},
  action: {alignItems: 'center', gap: 4, minWidth: 64},
  actionDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {color: 'rgba(235,235,245,0.75)', fontWeight: '500'},
  actionActive: {color: colors.accent},
});
