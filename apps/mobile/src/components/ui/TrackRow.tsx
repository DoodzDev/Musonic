/**
 * @file TrackRow.tsx
 * @description Design v2 track row, the single row used by every track list.
 *   Leads with the track number or a cover; shows title, subtitle and small
 *   badges; marks the current track (accent title, equalizer); keeps the like,
 *   add-to-playlist and download actions visible (ADR-010 F1) and also exposes
 *   them to TalkBack as custom actions. Dims when unavailable offline. With
 *   `onAddToQueue`, swiping the row right adds the track to the queue.
 *   Memoised: pass stable callbacks so long lists stay at 60 fps.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Text from './Text';
import Badge, {type BadgeKind} from './Badge';
import Cover from './Cover';
import Equalizer from './Equalizer';
import {SwipeableRow} from './gestures';
import {QueueAddIcon} from '../icons';
import HeartIcon from '../icons/HeartIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import DownloadIcon from '../icons/DownloadIcon';
import {colors, radii, sizes, spacing} from '../../theme';
import {haptic} from '../../services/haptics';
import {useT} from '../../i18n';

export type DownloadState = 'none' | 'downloading' | 'done';

/** `current` = loaded in the player; `playing` = loaded and playing. */
export type RowPlayback = 'idle' | 'current' | 'playing';

type Props = {
  title: string;
  subtitle?: string;
  /** Shows this number instead of a cover (album track lists). */
  number?: number;
  coverId?: string;
  coverUrl?: string;
  badges?: BadgeKind[];
  playback?: RowPlayback;
  liked?: boolean;
  download?: DownloadState;
  /** Greyed out: not downloaded while offline (ADR-010 I3). */
  unavailable?: boolean;
  /** Hides the like / add / download buttons (e.g. inside a sheet). */
  hideActions?: boolean;
  onPress?: () => void;
  /** Opens the track menu. */
  onLongPress?: () => void;
  onToggleLike?: () => void;
  onAddToPlaylist?: () => void;
  onDownload?: () => void;
  /** Swipe right adds the track to the end of the queue. */
  onAddToQueue?: () => void;
};

const ACTION = 36;

function TrackRow({
  title,
  subtitle,
  number,
  coverId,
  coverUrl,
  badges,
  playback = 'idle',
  liked = false,
  download = 'none',
  unavailable = false,
  hideActions = false,
  onPress,
  onLongPress,
  onToggleLike,
  onAddToPlaylist,
  onDownload,
  onAddToQueue,
}: Props) {
  const t = useT();
  const current = playback !== 'idle';
  const likeLabel = liked ? t.ui.unlike : t.ui.like;
  const downloadLabel =
    download === 'done' ? t.ui.badgeDownloaded : download === 'downloading' ? t.ui.downloading : t.ui.download;

  const spoken = [
    title,
    subtitle,
    current ? t.ui.nowPlaying : null,
    download === 'done' ? t.ui.badgeDownloaded : null,
    unavailable ? t.ui.unavailableOffline : null,
  ]
    .filter(Boolean)
    .join(', ');

  const actions = hideActions
    ? undefined
    : [
        {name: 'like', label: likeLabel},
        {name: 'add', label: t.ui.addToPlaylist},
        ...(download === 'none' ? [{name: 'download', label: t.ui.download}] : []),
      ];

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'like') onToggleLike?.();
    else if (e.nativeEvent.actionName === 'add') onAddToPlaylist?.();
    else if (e.nativeEvent.actionName === 'download') onDownload?.();
  };

  const row = (
    <View style={[styles.row, number !== undefined ? styles.compact : null, unavailable && styles.dimmed]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityState={{selected: current, disabled: unavailable}}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        android_ripple={{color: colors.fill}}
        style={styles.main}>
        {number !== undefined ? (
          <View style={styles.number}>
            {current ? (
              <Equalizer playing={playback === 'playing'} />
            ) : (
              <Text variant="subhead" color="textSecondary">
                {number}
              </Text>
            )}
          </View>
        ) : (
          <View>
            <Cover id={coverId} imageUrl={coverUrl} size="row" />
            {current ? (
              <View style={styles.coverOverlay}>
                <Equalizer playing={playback === 'playing'} />
              </View>
            ) : null}
          </View>
        )}
        <View style={styles.text}>
          <Text
            variant="callout"
            numberOfLines={1}
            style={[styles.title, current && styles.titleCurrent]}>
            {title}
          </Text>
          {subtitle || badges?.length ? (
            <View style={styles.meta}>
              {badges?.map(b => (
                <Badge key={b} kind={b} size="small" />
              ))}
              {subtitle ? (
                <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>

      {hideActions ? null : (
        <View style={styles.actions} importantForAccessibility="no-hide-descendants">
          <Pressable
            onPress={() => {
              haptic('success');
              onToggleLike?.();
            }}
            hitSlop={4}
            style={styles.action}>
            <HeartIcon size={20} color={liked ? colors.accent : colors.textSecondary} filled={liked} />
          </Pressable>
          <Pressable onPress={onAddToPlaylist} hitSlop={4} style={styles.action}>
            <PlusCircleIcon size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={download === 'none' ? onDownload : undefined}
            disabled={download !== 'none'}
            hitSlop={4}
            accessibilityLabel={downloadLabel}
            style={styles.action}>
            {download === 'downloading' ? (
              <ActivityIndicator size="small" color={colors.success} />
            ) : (
              <DownloadIcon size={20} color={download === 'done' ? colors.success : colors.textSecondary} />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );

  if (!onAddToQueue || unavailable) return row;
  return (
    <SwipeableRow
      direction="right"
      background="transparent"
      actionLabel={t.ui.addToQueue}
      actionIcon={<QueueAddIcon size={20} color={colors.onAccent} />}
      onAction={onAddToQueue}>
      {row}
    </SwipeableRow>
  );
}

export default React.memo(TrackRow);

const styles = StyleSheet.create({
  row: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.xs,
  },
  compact: {height: sizes.listRowMin},
  dimmed: {opacity: 0.4},
  main: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
    paddingLeft: spacing.gutter,
  },
  number: {width: 22, alignItems: 'center'},
  coverOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.cover,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, minWidth: 0, gap: 2},
  title: {fontWeight: '500'},
  titleCurrent: {color: colors.accent, fontWeight: '600'},
  meta: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  subtitle: {flexShrink: 1},
  actions: {flexDirection: 'row', alignItems: 'center'},
  action: {width: ACTION, height: ACTION, alignItems: 'center', justifyContent: 'center'},
});
