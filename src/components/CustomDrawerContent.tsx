/**
 * @file CustomDrawerContent.tsx
 * @description Content rendered inside the slide-in drawer. Shows navigation
 *   links, offline mode toggle, app version, and credits section.
 * @author DoodzProg
 * @version 1.0.3
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {useNavigation} from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Line, Path, Circle} from 'react-native-svg';
import LogoIcon from './icons/LogoIcon';
import {darkTheme} from '../theme';
import {useSettingsStore} from '../store/settingsStore';
import {useDownloadStore} from '../store/downloadStore';
import {pingServer} from '../api/client';
import {withTimeout} from '../services/connectivityService';
import {useT} from '../i18n';

const APP_VERSION = 'v1.0.5';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PrefsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Line x1={3} y1={6} x2={21} y2={6} stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={21} y2={12} stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={3} y1={18} x2={21} y2={18} stroke="#aaa" strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8} cy={6} r={2.5} fill="#1a1a1a" stroke="#aaa" strokeWidth={1.8} />
      <Circle cx={16} cy={12} r={2.5} fill="#1a1a1a" stroke="#aaa" strokeWidth={1.8} />
      <Circle cx={10} cy={18} r={2.5} fill="#1a1a1a" stroke="#aaa" strokeWidth={1.8} />
    </Svg>
  );
}

function LogoutIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M9 21 L3 21 L3 3 L9 3" fill="none" stroke="#E8553E" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 17 L21 12 L16 7" fill="none" stroke="#E8553E" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={21} y1={12} x2={9} y2={12} stroke="#E8553E" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function WifiOffIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"
        stroke="#aaa"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WifiIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.55a11 11 0 0 1 14.08 0" stroke="#FF6B35" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M1.42 9a16 16 0 0 1 21.16 0" stroke="#FF6B35" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" stroke="#FF6B35" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 20h.01" stroke="#FF6B35" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// link.svg — chain link icon
function LinkIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

// Gihtub.svg — GitHub mark
function GitHubIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 30 30" fill="#aaa">
      <Path d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z" />
    </Svg>
  );
}

// Doodz.dev.svg — profile card icon
function DoodzDevIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 256 256" fill="#aaa">
      <Path d="M75.19,198.4a8,8,0,0,0,11.21-1.6,52,52,0,0,1,83.2,0,8,8,0,1,0,12.8-9.6A67.88,67.88,0,0,0,155,165.51a40,40,0,1,0-53.94,0A67.88,67.88,0,0,0,73.6,187.2,8,8,0,0,0,75.19,198.4ZM128,112a24,24,0,1,1-24,24A24,24,0,0,1,128,112Zm72-88H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V40A16,16,0,0,0,200,24Zm0,192H56V40H200ZM88,64a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H96A8,8,0,0,1,88,64Z" />
    </Svg>
  );
}

import type {DrawerContentComponentProps} from '@react-navigation/drawer';

type Props = Partial<DrawerContentComponentProps> & {onClose?: () => void};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2).replace('.', ',')} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} Go`;
}

export default function CustomDrawerContent({onClose}: Props) {
  const t = useT();
  const navigation = useNavigation<any>();
  const {getActiveServer, disconnectServer, isOfflineMode, setOfflineMode} = useSettingsStore();
  const server = getActiveServer();
  const [isPinging, setIsPinging] = useState(false);
  const totalSizeBytes = useDownloadStore(s => s.getTotalSizeBytes());

  const handleDisconnect = () => {
    Alert.alert(
      t.drawer.logoutTitle,
      t.drawer.logoutMessage(server?.name ?? 'Serveur', server?.url ?? ''),
      [
        {text: t.drawer.cancelButton, style: 'cancel'},
        {
          text: t.drawer.logoutConfirm,
          style: 'destructive',
          onPress: () => {
            onClose?.();
            disconnectServer();
          },
        },
      ],
    );
  };

  const handleGoOnline = async () => {
    if (isPinging || !server) return;
    setIsPinging(true);
    try {
      await withTimeout(pingServer(server), 5000);
      setOfflineMode(false);
    } catch {
      Alert.alert(t.drawer.pingFailed, t.drawer.pingFailedMessage);
    } finally {
      setIsPinging(false);
    }
  };

  const MENU_ITEMS = [
    {label: t.drawer.settings, icon: <PrefsIcon />, screen: 'Settings'},
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <LogoIcon size={64} />
        <Text style={styles.appName}>Musonic</Text>
        <Text style={styles.version}>{APP_VERSION}</Text>
      </View>

      {/* Menu items */}
      <View style={styles.menu}>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity
            key={item.label}
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => {
              if (item.screen) {
                navigation.navigate(item.screen);
                onClose?.();
              }
            }}>
            {item.icon}
            <Text style={styles.itemLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Offline mode toggle */}
        {isOfflineMode ? (
          <View style={styles.offlineBlock}>
            <View style={styles.offlineHeader}>
              <WifiOffIcon />
              <Text style={styles.offlineModeLabel}>{t.offline.offlineModeActive}</Text>
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>{t.drawer.offlineActive}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.item, styles.goOnlineItem]}
              activeOpacity={0.7}
              disabled={isPinging}
              onPress={handleGoOnline}>
              {isPinging ? (
                <ActivityIndicator size="small" color="#FF6B35" />
              ) : (
                <WifiIcon />
              )}
              <Text style={[styles.itemLabel, styles.goOnlineLabel]}>{t.drawer.goOnline}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => setOfflineMode(true)}>
            <WifiOffIcon />
            <Text style={styles.itemLabel}>{t.drawer.goOffline}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Storage info */}
      {totalSizeBytes > 0 && (
        <View style={styles.storageBlock}>
          <Text style={styles.storageLabel}>{t.drawer.storageLabel}</Text>
          <Text style={styles.storageText}>{formatBytes(totalSizeBytes)}</Text>
        </View>
      )}

      {/* Separator */}
      <View style={styles.separator} />

      {/* Logout */}
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.item} onPress={handleDisconnect} activeOpacity={0.7}>
          <LogoutIcon />
          <Text style={[styles.itemLabel, styles.logoutLabel]}>{t.drawer.logout}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.spacer} />

      {/* Credits */}
      <View style={styles.separator} />
      <View style={styles.credits}>
        <Text style={styles.madeBy}>made by Doodz</Text>
        <View style={styles.links}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://doodzprog.github.io/Musonic/')}
            activeOpacity={0.7}
            style={styles.linkBtn}>
            <LinkIcon />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://github.com/DoodzProg/Musonic')}
            activeOpacity={0.7}
            style={styles.linkBtn}>
            <GitHubIcon />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://doodz.dev')}
            activeOpacity={0.7}
            style={styles.linkBtn}>
            <DoodzDevIcon />
            <Text style={styles.linkText}>doodz.dev</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: darkTheme.background},
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 4,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: darkTheme.textPrimary,
    marginTop: 4,
  },
  version: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  menu: {paddingHorizontal: 12, gap: 2},
  separator: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginVertical: 12,
  },
  bottom: {paddingHorizontal: 12},
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: darkTheme.textPrimary,
  },
  logoutLabel: {
    color: '#E8553E',
  },
  offlineBlock: {
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    marginTop: 2,
    overflow: 'hidden',
  },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  offlineModeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
  },
  offlineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#FF6B3530',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B35',
  },
  goOnlineItem: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  goOnlineLabel: {
    color: '#FF6B35',
  },
  storageBlock: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    gap: 4,
  },
  storageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.2,
  },
  storageText: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '600',
  },
  credits: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 10,
  },
  madeBy: {
    fontSize: 12,
    color: '#444',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  linkText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
});
