/**
 * @file Rail.tsx
 * @description Design v2 Rail, the landscape tab bar (R3.4): a glass capsule
 *   holding the Home and Library tabs, a separate glass search circle and, at
 *   the bottom, a glass mini player tile (cover, thin progress line, play /
 *   pause). Same navigator state as the portrait Dock, on the left or right
 *   edge per settings. The rail sits on the screen edge and its column
 *   absorbs that side's safe-area inset: a front camera hole there falls in
 *   the empty middle, between the tabs (top) and search + player (bottom).
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import {useForegroundProgress} from '../hooks/useForegroundProgress';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import GlassSurface from '../components/ui/GlassSurface';
import Cover from '../components/ui/Cover';
import Text from '../components/ui/Text';
import HomeIcon from '../components/icons/HomeIcon';
import LibraryIcon from '../components/icons/LibraryIcon';
import SearchIcon from '../components/icons/SearchIcon';
import PlayIcon from '../components/icons/PlayIcon';
import PauseIcon from '../components/icons/PauseIcon';
import {usePlayerStore} from '../store/playerStore';
import {useSettingsStore} from '../store/settingsStore';
import {skipNext, skipPrev} from '../services/playerActions';
import {haptic} from '../services/haptics';
import {colors, radii, sizes} from '../theme';
import {useT} from '../i18n';
import {railWidth} from '../hooks/useLandscapeSidebarPadding';

type Route = BottomTabBarProps['state']['routes'][number];

const ICONS: Record<string, typeof HomeIcon> = {Home: HomeIcon, Library: LibraryIcon};

/** Width of the capsule, the search circle and the mini player tile. */
const RAIL_ITEM = 60;
/** Diameter of the search circle: a little smaller, to keep the middle free. */
const RAIL_SEARCH = 56;
/** Margin between the rail items and the screen edges. */
const RAIL_GAP = 10;
/** Gap inside the bottom group (search + player), kept tight for the same reason. */
const RAIL_BOTTOM_GAP = 8;

function ProgressLine({duration}: {duration: number}) {
  const {position} = useForegroundProgress();
  const fraction = duration > 0 ? Math.min(position / duration, 1) : 0;
  return (
    <View style={styles.progressTrack} pointerEvents="none">
      <View style={[styles.progressFill, {width: `${fraction * 100}%`}]} />
    </View>
  );
}

function RailMiniPlayer() {
  const t = useT();
  const track = useActiveTrack();
  const {state} = usePlaybackState();
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const openFullScreen = usePlayerStore(s => s.openFullScreen);
  const visible = usePlayerStore(s => s.isMiniPlayerVisible);

  if (!visible || !track?.id) return null;
  const playing = state === State.Playing;

  return (
    <GlassSurface radius={radii.tile + 6} style={styles.mini}>
      <Pressable
        onPress={openFullScreen}
        accessibilityRole="button"
        accessibilityLabel={[track.title, track.artist].filter(Boolean).join(', ')}
        accessibilityHint={t.ui.openPlayer}
        accessibilityActions={[
          {name: 'activate'},
          {name: 'next', label: t.ui.nextTrack},
          {name: 'previous', label: t.ui.previousTrack},
        ]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'next') skipNext();
          else if (e.nativeEvent.actionName === 'previous') skipPrev();
          else openFullScreen();
        }}>
        <Cover id={track.coverArt as string | undefined} imageUrl={track.coverArt ? undefined : track.artwork} size="row" />
        <ProgressLine duration={track.duration ?? 0} />
      </Pressable>
      <Pressable
        onPress={() => {
          haptic('light');
          togglePlay();
        }}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={playing ? t.ui.pause : t.ui.play}
        style={styles.miniControl}>
        {playing ? <PauseIcon size={22} color={colors.textPrimary} /> : <PlayIcon size={22} color={colors.textPrimary} />}
      </Pressable>
    </GlassSurface>
  );
}

export default function Rail({state, descriptors, navigation}: BottomTabBarProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const side = useSettingsStore(s => s.navBarPosition);

  const press = (route: Route, focused: boolean) => {
    haptic('selection');
    const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  const label = (route: Route) => (descriptors[route.key].options.tabBarLabel as string) ?? route.name;
  // Narrow column: short visible label, full name for TalkBack.
  const shortLabel = (route: Route) => (route.name === 'Library' ? t.tabs.libraryShort : label(route));
  const search = state.routes.find(r => r.name === 'Search');
  const tabs = state.routes.filter(r => r.name !== 'Search');
  const focusedName = state.routes[state.index].name;
  const sideInset = side === 'right' ? insets.right : insets.left;
  const edge = side === 'right' ? {right: 0} : {left: 0};

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.rail,
        edge,
        {width: railWidth(sideInset), paddingTop: insets.top + RAIL_GAP, paddingBottom: insets.bottom + RAIL_GAP},
      ]}>
      <View accessibilityRole="tablist">
        <GlassSurface radius={RAIL_ITEM / 2} style={styles.tabs}>
          {tabs.map(route => {
            const focused = route.name === focusedName;
            const Icon = ICONS[route.name] ?? HomeIcon;
            const color = focused ? colors.accent : colors.textSecondary;
            return (
              <Pressable
                key={route.key}
                onPress={() => press(route, focused)}
                accessibilityRole="tab"
                accessibilityState={{selected: focused}}
                accessibilityLabel={label(route)}
                style={[styles.tab, focused && styles.tabActive]}>
                <Icon size={22} color={color} filled={focused} />
                <Text variant="caption" numberOfLines={1} style={[styles.tabLabel, {color}]}>
                  {shortLabel(route)}
                </Text>
              </Pressable>
            );
          })}
        </GlassSurface>
      </View>

      <View style={styles.bottom}>
        {search ? (
          <GlassSurface radius={RAIL_SEARCH / 2} style={styles.searchCircle}>
            <Pressable
              onPress={() => press(search, focusedName === 'Search')}
              accessibilityRole="tab"
              accessibilityState={{selected: focusedName === 'Search'}}
              accessibilityLabel={label(search)}
              style={[styles.searchHit, focusedName === 'Search' && styles.tabActive]}>
              <SearchIcon
                size={24}
                color={focusedName === 'Search' ? colors.accent : colors.textPrimary}
                filled={focusedName === 'Search'}
              />
            </Pressable>
          </GlassSurface>
        ) : null}
        <RailMiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottom: {alignItems: 'center', gap: RAIL_BOTTOM_GAP},
  tabs: {width: RAIL_ITEM, padding: 4, gap: 4},
  tab: {
    height: 56,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {fontSize: 10, lineHeight: 12},
  tabActive: {backgroundColor: colors.badgeFill},
  searchCircle: {width: RAIL_SEARCH, height: RAIL_SEARCH, padding: 4},
  searchHit: {flex: 1, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center'},
  mini: {width: RAIL_ITEM, paddingTop: 6, alignItems: 'center', overflow: 'hidden'},
  miniControl: {
    width: sizes.touchTarget,
    height: sizes.touchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 3,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressFill: {height: 2, borderRadius: 1, backgroundColor: colors.accent},
});
