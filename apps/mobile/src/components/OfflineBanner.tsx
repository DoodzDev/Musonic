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
import Svg, {Path} from 'react-native-svg';
import {useNetworkStore} from '../store/networkStore';
import {useSettingsStore} from '../store/settingsStore';
import {useT} from '../i18n';

const BANNER_H = 32;

// ─── Icons ────────────────────────────────────────────────────────────────────

function WifiOffIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ServerOffIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 3h20v6H2zM2 15h20v6H2z"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 7h.01M6 19h.01"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 2l20 20"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

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
          {isOffline ? <WifiOffIcon /> : <ServerOffIcon />}
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
