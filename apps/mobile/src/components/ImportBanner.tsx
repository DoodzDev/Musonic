/**
 * @file ImportBanner.tsx
 * @description Small pill at the top of the app, just under the status bar,
 *   while a playlist import runs on the server: "Playlist import: 15/100",
 *   live (polled by `services/playlistImport`). It floats over the screen
 *   without moving it and lets touches through.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useImportStore} from '../services/playlistImport';
import {useT} from '../i18n';
import {colors, radii} from '../theme';


export default function ImportBanner() {
  const t = useT();
  const active = useImportStore(s => s.active);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {toValue: active ? 1 : 0, duration: 280, useNativeDriver: true}).start();
  }, [active, opacity]);

  const done = active?.done ?? 0;
  const total = active?.total ?? 0;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, {top: insets.top + 4, opacity}]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={active ? t.playlistImport.bannerLabel(active.name, done, total) : undefined}>
      {active ? <Text style={styles.text}>{t.playlistImport.banner(done, total)}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surface2,
  },
  text: {color: colors.textPrimary, fontSize: 12, fontWeight: '600'},
});
