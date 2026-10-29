/**
 * @file DockMiniPlayer.tsx
 * @description Design v2 mini player: a floating glass capsule in the Dock
 *   with the cover, title, artist, previous, play / pause and next. Tapping
 *   the cover or titles (never the buttons) or swiping up opens the full
 *   player; swiping left / right skips to the next / previous track (shared
 *   gesture module). A thin accent line shows progress. The Previous button
 *   follows the 3-second rule (ADR-009 C1); the swipe always changes track.
 *   Behind the cover and titles, a heavily zoomed, blurred piece of the cover
 *   fades into the glass.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {State, useActiveTrack, usePlaybackState, type Track} from '../../services/player';
import {useForegroundProgress} from '../../hooks/useForegroundProgress';
import GlassSurface from '../ui/GlassSurface';
import CoverWash from '../ui/CoverWash';
import {BLURRED_COVER_SOURCE_SIZE} from '../ui/BlurredCover';
import {getCoverArtUrl} from '../../api/client';
import Cover from '../ui/Cover';
import Text from '../ui/Text';
import {SwipeSurface} from '../ui/gestures';
import PlayIcon from '../icons/PlayIcon';
import PauseIcon from '../icons/PauseIcon';
import NextIcon from '../icons/NextIcon';
import PrevIcon from '../icons/PrevIcon';
import {ComputerIcon, PhoneIcon} from '../icons';
import {useRemotePlayback} from '../../services/connect/useConnect';
import {usePlayerStore} from '../../store/playerStore';
import {skipNext, skipPrev, skipPrevForce} from '../../services/playerActions';
import {haptic} from '../../services/haptics';
import {colors, radii, sizes, spacing} from '../../theme';
import {DOCK_MINI_HEIGHT} from '../../navigation/dockLayout';
import {useT} from '../../i18n';
import {setupPlayer} from '../../services/setupPlayer';
import {loadQueue} from '../../services/playback/snapshot';
import {useSettingsStore} from '../../store/settingsStore';

/** The current track saved with the queue: shown at launch, before the player has restored it. */
function savedTrack(): Track | null {
  const account = useSettingsStore.getState().activeServerId;
  return account ? loadQueue<Track & {id: string}>(account, t => t)?.current ?? null : null;
}

/** `remote`: the position of the device playing elsewhere (Musonic Connect). */
function ProgressLine({duration, remote}: {duration: number; remote?: number}) {
  const {position: local} = useForegroundProgress();
  const position = remote ?? local;
  const fraction = duration > 0 ? Math.min(position / duration, 1) : 0;
  return (
    <View style={styles.progressTrack} pointerEvents="none">
      <View style={[styles.progressFill, {width: `${fraction * 100}%`}]} />
    </View>
  );
}

export default function DockMiniPlayer() {
  const t = useT();
  const live = useActiveTrack();
  // Launch: the saved track at once (the player restores the queue ~0.6 s later); then only
  // the player's, so an emptied queue hides the mini player.
  const [saved] = useState(savedTrack);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let mounted = true;
    setupPlayer().finally(() => mounted && setRestored(true));
    return () => {
      mounted = false;
    };
  }, []);
  const {state} = usePlaybackState();
  const localToggle = usePlayerStore(s => s.togglePlay);
  const openFullScreen = usePlayerStore(s => s.openFullScreen);
  const visible = usePlayerStore(s => s.isMiniPlayerVisible);
  // Musonic Connect: another device plays, not the phone: its track, and the buttons control it.
  const remote = useRemotePlayback();
  const track = remote ? remote.track : restored ? live : live ?? saved ?? undefined;
  const togglePlay = remote ? remote.toggle : localToggle;
  const next = remote ? remote.next : skipNext;
  const previous = remote ? remote.previous : skipPrev;

  // Before the restore, the store does not know the queue yet: the saved track decides.
  if (!(remote || visible || (!restored && saved)) || !track?.id) return null;
  const playing = remote ? remote.playing : state === State.Playing;
  const DeviceIcon = remote?.device.kind === 'phone' || remote?.device.kind === 'car' ? PhoneIcon : ComputerIcon;
  let washUri: string | undefined;
  try {
    washUri = track.coverArt
      ? getCoverArtUrl(String(track.coverArt), BLURRED_COVER_SOURCE_SIZE)
      : typeof track.artwork === 'string' ? track.artwork : undefined;
  } catch {
    washUri = undefined;
  }

  return (
    <SwipeSurface onSwipeUp={openFullScreen} onSwipeLeft={next} onSwipeRight={remote ? remote.previous : skipPrevForce}>
      {/* Not ready yet (saved track shown): taps would reach an empty player. */}
      <GlassSurface style={styles.capsule} pointerEvents={restored || live ? 'auto' : 'none'}>
        <CoverWash uri={washUri} />
        {/* Only the cover and titles open the player: the buttons just act. */}
        <Pressable
          onPress={openFullScreen}
          style={styles.info}
          accessibilityRole="button"
          accessibilityLabel={[track.title, track.artist].filter(Boolean).join(', ')}
          accessibilityHint={t.ui.openPlayer}
          accessibilityActions={[
            {name: 'activate'},
            {name: 'next', label: t.ui.nextTrack},
            {name: 'previous', label: t.ui.previousTrack},
          ]}
          onAccessibilityAction={e => {
            if (e.nativeEvent.actionName === 'next') next();
            else if (e.nativeEvent.actionName === 'previous') previous();
            else openFullScreen();
          }}>
          <Cover
            id={track.coverArt as string | undefined}
            imageUrl={track.coverArt ? undefined : track.artwork}
            size="row"
            round
          />
          <View style={styles.text}>
            <Text variant="subhead" numberOfLines={1} style={styles.title}>
              {track.title ?? ''}
            </Text>
            {remote ? (
              <View style={styles.device}>
                <DeviceIcon size={13} color={colors.accent} />
                <Text variant="footnote" numberOfLines={1} style={styles.deviceName}>
                  {remote.device.name}
                </Text>
              </View>
            ) : (
              <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                {track.artist ?? ''}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            haptic('light');
            previous();
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t.ui.previousTrack}
          style={styles.control}>
          <PrevIcon size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => {
            haptic('light');
            togglePlay();
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={playing ? t.ui.pause : t.ui.play}
          style={styles.control}>
          {playing ? <PauseIcon size={24} color={colors.textPrimary} /> : <PlayIcon size={24} color={colors.textPrimary} />}
        </Pressable>
        <Pressable
          onPress={() => {
            haptic('light');
            next();
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t.ui.nextTrack}
          style={styles.control}>
          <NextIcon size={22} color={colors.textPrimary} />
        </Pressable>
        <ProgressLine duration={track.duration ?? 0} remote={remote?.position} />
      </GlassSurface>
    </SwipeSurface>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: DOCK_MINI_HEIGHT,
    borderRadius: radii.capsule + 4,
    paddingLeft: spacing.s,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  info: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.m - 4},
  text: {flex: 1, minWidth: 0},
  title: {fontWeight: '600'},
  control: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.fill,
  },
  progressFill: {height: 2, borderRadius: 1, backgroundColor: colors.accent},
  device: {flexDirection: 'row', alignItems: 'center', gap: 4},
  deviceName: {color: colors.accent, flexShrink: 1},
});
