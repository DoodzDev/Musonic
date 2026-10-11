/**
 * @file TabNavigator.tsx
 * @description Bottom tab navigator with three tabs: Home, Search, Library.
 *   Each tab hosts its own stack so deep-link screens (AlbumDetail, ArtistDetail)
 *   are reachable from any tab without cross-stack navigation. Fully custom
 *   `tabBar` render: the Design v2 Dock in portrait (glass mini player, tab
 *   capsule and search circle), a vertical sidebar (left or right, per
 *   settings) in landscape — same navigator state/behavior, only the visual
 *   arrangement differs.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback} from 'react';
import {StyleSheet, View, TouchableOpacity} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useT} from '../i18n';
import {useSettingsStore} from '../store/settingsStore';
import {useIsLandscape} from '../hooks/useIsLandscape';
import {SIDEBAR_WIDTH} from './shellConstants';
import HomeStack from './HomeStack';
import SearchStack from './SearchStack';
import LibraryStack from './LibraryStack';
import HomeIcon from '../components/icons/HomeIcon';
import SearchIcon from '../components/icons/SearchIcon';
import LibraryIcon from '../components/icons/LibraryIcon';
import MiniPlayer from '../components/MiniPlayer';
import Dock from './Dock';
import FullScreenPlayer from '../components/FullScreenPlayer';
import AudioPlayer from '../components/AudioPlayer';
import ConnectivityMonitor from '../components/ConnectivityMonitor';
import {GlobalToast} from '../components/Toast';
import {useImageColor} from '../hooks/useImageColor';

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

// ─── Custom tab bar (portrait bottom row / landscape sidebar) ─────────────────

function AppTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isLandscape = useIsLandscape();
  const navBarPosition = useSettingsStore(s => s.navBarPosition);

  const handlePress = (route: (typeof state.routes)[number], isFocused: boolean) => {
    const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  if (isLandscape) {
    return (
      <View
        style={[
          styles.sidebar,
          navBarPosition === 'right' ? styles.sidebarRight : styles.sidebarLeft,
          {paddingTop: insets.top + 16},
        ]}>
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const isFocused = state.index === index;
          const Icon = options.tabBarIcon as React.ComponentType<TabIconProps> | undefined;
          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => handlePress(route, isFocused)}
              style={styles.sidebarItem}
              activeOpacity={0.7}>
              {Icon && <Icon focused={isFocused} color={isFocused ? COLOR_ACTIVE : COLOR_INACTIVE} size={ICON_SIZE} />}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return <Dock state={state} descriptors={descriptors} navigation={navigation} insets={insets} />;
}

// ─── Navigator ─────────────────────────────────────────────────────────────────

export default function TabNavigator() {
  const t = useT();
  const isLandscape = useIsLandscape();
  useImageColor();

  const renderTabBar = useCallback((props: BottomTabBarProps) => <AppTabBar {...props} />, []);

  return (
    <View style={styles.fill}>
      <Tab.Navigator
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
      {/* Portrait: the mini player lives in the Dock. Landscape keeps the side-bar tile until P3 lot 3. */}
      {isLandscape && <MiniPlayer />}
      <FullScreenPlayer />
      <GlobalToast />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#000000',
    alignItems: 'center',
    gap: 44,
    zIndex: 10,
  },
  sidebarLeft: {left: 0},
  sidebarRight: {right: 0},
  sidebarItem: {
    width: SIDEBAR_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
});
