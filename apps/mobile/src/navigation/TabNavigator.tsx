/**
 * @file TabNavigator.tsx
 * @description Bottom tab navigator with three tabs: Home, Search, Library.
 *   Each tab hosts its own stack so deep-link screens (AlbumDetail, ArtistDetail)
 *   are reachable from any tab without cross-stack navigation. Fully custom
 *   `tabBar` render: the Design v2 Dock in portrait (glass mini player, tab
 *   capsule and search circle), the Design v2 Rail in landscape (glass tab
 *   capsule, search circle and mini player tile, left or right per settings)
 *   — same navigator state/behavior, only the visual arrangement differs.
 *   Also hosts the app-wide Design v2 toast, just above the Dock. Opens on
 *   the start tab chosen in Settings.
 * @author DoodzProg
 * @version 1.4.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useT} from '../i18n';
import {useIsLandscape} from '../hooks/useIsLandscape';
import HomeStack from './HomeStack';
import SearchStack from './SearchStack';
import LibraryStack from './LibraryStack';
import HomeIcon from '../components/icons/HomeIcon';
import SearchIcon from '../components/icons/SearchIcon';
import LibraryIcon from '../components/icons/LibraryIcon';
import Dock from './Dock';
import Rail from './Rail';
import FullScreenPlayer from '../components/FullScreenPlayer';
import AudioPlayer from '../components/AudioPlayer';
import ConnectivityMonitor from '../components/ConnectivityMonitor';
import {GlobalToast} from '../components/Toast';
import {ToastHost} from '../components/ui/Toast';
import {DOCK_GAP, useDockInset} from './dockLayout';
import {useImageColor} from '../hooks/useImageColor';
import {useSettingsStore} from '../store/settingsStore';

const Tab = createBottomTabNavigator();

const ICON_SIZE = 24;
const COLOR_ACTIVE = '#FFFFFF';
const COLOR_INACTIVE = '#707070';

type TabIconProps = {focused: boolean; color: string; size: number};

function HomeTabIcon({focused}: TabIconProps) {
  return <HomeIcon size={ICON_SIZE} color={focused ? COLOR_ACTIVE : COLOR_INACTIVE} filled={focused} />;
}
function SearchTabIcon({focused}: TabIconProps) {
  return <SearchIcon size={ICON_SIZE} color={focused ? COLOR_ACTIVE : COLOR_INACTIVE} filled={focused} />;
}
function LibraryTabIcon({focused}: TabIconProps) {
  return <LibraryIcon size={ICON_SIZE} color={focused ? COLOR_ACTIVE : COLOR_INACTIVE} filled={focused} />;
}

// ─── Custom tab bar (portrait Dock / landscape Rail) ─────────────────

function AppTabBar(props: BottomTabBarProps) {
  const isLandscape = useIsLandscape();
  return isLandscape ? <Rail {...props} /> : <Dock {...props} />;
}

// ─── Navigator ─────────────────────────────────────────────────────────────────

export default function TabNavigator() {
  const t = useT();
  useImageColor();
  // Read once: changing the setting applies at the next start, not under the user's feet.
  const [startTab] = useState(() => useSettingsStore.getState().startTab);

  const renderTabBar = useCallback((props: BottomTabBarProps) => <AppTabBar {...props} />, []);

  return (
    <View style={styles.fill}>
      <Tab.Navigator
        initialRouteName={startTab}
        screenOptions={{headerShown: false}}
        tabBar={renderTabBar}>
        <Tab.Screen
          name="Home"
          component={HomeStack}
          options={{
            tabBarLabel: t.tabs.home,
            tabBarIcon: HomeTabIcon,
          }}
        />
        <Tab.Screen
          name="Search"
          component={SearchStack}
          options={{
            tabBarLabel: t.tabs.search,
            tabBarIcon: SearchTabIcon,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate('Search', { screen: 'SearchHome' });
            },
          })}
        />
        <Tab.Screen
          name="Library"
          component={LibraryStack}
          options={{
            tabBarLabel: t.tabs.library,
            tabBarIcon: LibraryTabIcon,
          }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate('Library', { screen: 'LibraryHome' });
            },
          })}
        />
      </Tab.Navigator>

      <ConnectivityMonitor />
      <AudioPlayer />
      <FullScreenPlayer />
      <GlobalToast />
      <AppToastHost />
    </View>
  );
}

/** App-wide toast host, right above the Dock (and the mini player). */
function AppToastHost() {
  return <ToastHost bottom={useDockInset() - DOCK_GAP} />;
}

const styles = StyleSheet.create({
  fill: {flex: 1},
});
