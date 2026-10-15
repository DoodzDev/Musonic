/**
 * @file OfflineBanner.tsx
 * @description Inline banner (not absolute) rendered at the top of GlobalHeader.
 *   Animates its height (0 → 40) to push header content down instead of overlaying it.
 *   3 states:
 *   1. isOfflineMode=true → orange "Mode hors-ligne" strip (no interaction)
 *   2. network error without offline mode → red/orange + "Go offline" button
 *   3. all OK → hidden (height: 0)
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {useNetworkStore} from '../store/networkStore';
import {useSettingsStore} from '../store/settingsStore';
import {useT} from '../i18n';
import {ServerOffIcon, WifiOffIcon} from './icons';

const BANNER_H = 32;

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Banner ───────────────────────────────────────────────────────────────────

export default function OfflineBanner() {
  const t = useT();
  const isOffline = useNetworkStore(s => s.isOffline);
  const serverReachable = useNetworkStore(s => s.serverReachable);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const setOfflineMode = useSettingsStore(s => s.setOfflineMode);
  const heightAnim = useRef(new Animated.Value(0)).current;

  const hasNetworkError = !isOfflineMode && (isOffline || !serverReachable);
  const showBanner = isOfflineMode || hasNetworkError;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: showBanner ? BANNER_H : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [showBanner, heightAnim]);

  const bannerBg = isOfflineMode ? '#FF6B35' : isOffline ? '#C0392B' : '#C0690B';

  return (
    <Animated.View
      style={[styles.banner, {height: heightAnim, backgroundColor: bannerBg}]}>
      {isOfflineMode ? (
        <Text style={styles.text}>{t.offline.offlineModeActive}</Text>
      ) : (
        <>
          {isOffline ? <WifiOffIcon size={13} /> : <ServerOffIcon size={13} />}
          <Text style={styles.text}>
            {isOffline ? t.offline.noInternet : t.offline.serverUnreachable}
          </Text>
          <TouchableOpacity
            style={styles.goOfflineBtn}
            onPress={() => setOfflineMode(true)}
            activeOpacity={0.8}>
            <Text style={styles.goOfflineText}>{t.offline.goOffline}</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  goOfflineBtn: {
    marginLeft: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  goOfflineText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
