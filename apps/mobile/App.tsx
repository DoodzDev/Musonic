/**
 * @file App.tsx
 * @description Root application component. Bootstraps the navigation container,
 *   global providers (SafeArea, GestureHandler), the audio player setup, and
 *   app-wide overlays (OfflineBanner, LikeRetryManager).
 * @author DoodzProg
 * @version 1.0.2
 * @license MIT
 */

import React, {useEffect} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import {darkTheme} from './src/theme';
import {useSetupPlayer} from './src/hooks/useSetupPlayer';
import OfflineBanner from './src/components/OfflineBanner';
import LikeRetryManager from './src/components/LikeRetryManager';
import PlaylistCacheManager from './src/components/PlaylistCacheManager';
import {checkForUpdateSilent} from './src/services/updateChecker';

export default function App() {
  useSetupPlayer();

  useEffect(() => {
    const timer = setTimeout(() => { checkForUpdateSilent(); }, 3000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={darkTheme.background}
        />
        <View style={styles.root}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <OfflineBanner />
          <LikeRetryManager />
          <PlaylistCacheManager />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
