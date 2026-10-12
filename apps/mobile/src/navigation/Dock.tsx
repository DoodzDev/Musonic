/**
 * @file Dock.tsx
 * @description Design v2 Dock, the portrait tab bar: the floating glass mini
 *   player above a glass capsule holding the Home and Library tabs and a
 *   separate glass search circle (ADR-010 B1). Content scrolls behind it and
 *   fades out under it instead of meeting a hard black band.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import GlassSurface from '../components/ui/GlassSurface';
import Text from '../components/ui/Text';
import DockMiniPlayer from '../components/shell/DockMiniPlayer';
import HomeIcon from '../components/icons/HomeIcon';
import LibraryIcon from '../components/icons/LibraryIcon';
import SearchIcon from '../components/icons/SearchIcon';
import {usePlayerStore} from '../store/playerStore';
import {haptic} from '../services/haptics';
import {hexToRgba} from '../utils/colorUtils';
import {colors, radii} from '../theme';
import {DOCK_GAP, DOCK_SIDE, DOCK_TABS_HEIGHT, dockHeight} from './dockLayout';

type Route = BottomTabBarProps['state']['routes'][number];

const ICONS: Record<string, typeof HomeIcon> = {Home: HomeIcon, Library: LibraryIcon};

/** Extra height of the fade above the Dock. */
const FADE_ABOVE = 48;
const FADE = [hexToRgba(colors.background, 0), hexToRgba(colors.background, 0.85)];

export default function Dock({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const miniVisible = usePlayerStore(s => s.isMiniPlayerVisible);

  const press = (route: Route, focused: boolean) => {
    haptic('selection');
    const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  const label = (route: Route) => (descriptors[route.key].options.tabBarLabel as string) ?? route.name;
  const search = state.routes.find(r => r.name === 'Search');
  const tabs = state.routes.filter(r => r.name !== 'Search');
  const focusedName = state.routes[state.index].name;

  return (
    <View pointerEvents="box-none" style={[styles.dock, {paddingBottom: insets.bottom + DOCK_GAP}]}>
      <LinearGradient
        pointerEvents="none"
        colors={FADE}
        style={[styles.fade, {height: insets.bottom + dockHeight(miniVisible) + FADE_ABOVE}]}
      />

      <DockMiniPlayer />

      <View style={styles.row} accessibilityRole="tablist">
        <GlassSurface radius={DOCK_TABS_HEIGHT / 2} style={styles.tabs}>
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
                <Icon size={24} color={color} filled={focused} />
                <Text variant="caption" style={{color}}>
                  {label(route)}
                </Text>
              </Pressable>
            );
          })}
        </GlassSurface>

        {search ? (
          <GlassSurface radius={DOCK_TABS_HEIGHT / 2} style={styles.searchCircle}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: DOCK_SIDE,
    gap: DOCK_GAP,
  },
  fade: {position: 'absolute', left: 0, right: 0, bottom: 0},
  row: {flexDirection: 'row', gap: DOCK_GAP, height: DOCK_TABS_HEIGHT},
  tabs: {flex: 1, flexDirection: 'row', padding: 4, gap: 4},
  tab: {
    flex: 1,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabActive: {backgroundColor: colors.badgeFill},
  searchCircle: {width: DOCK_TABS_HEIGHT, height: DOCK_TABS_HEIGHT, padding: 4},
  searchHit: {flex: 1, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center'},
});
