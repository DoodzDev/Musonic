/**
 * @file ProfileSheet.tsx
 * @description Design v2 Profile sheet, replacing the side drawer (ADR-010
 *   B2-B3): active account, offline mode, storage used, Settings, the Design
 *   screen (debug builds only), about links and log out. Accounts (switching,
 *   adding) live on a second page of the same sheet, kept as tall as the main
 *   page. The identity block is the sheet's fixed header, so swiping down on
 *   it closes the sheet; in landscape it moves to a column on the left.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {SlideInLeft, SlideInRight} from 'react-native-reanimated';
import {ScrollView} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import Sheet from '../ui/Sheet';
import Text from '../ui/Text';
import ArtistAvatar from '../ui/ArtistAvatar';
import {ListGroup, ListItem} from '../ui/ListGroup';
import {toast} from '../ui/Toast';
import CheckIcon from '../icons/CheckIcon';
import BackArrowIcon from '../icons/BackArrowIcon';
import {useSettingsStore} from '../../store/settingsStore';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useDownloadStore} from '../../store/downloadStore';
import {pingServer} from '../../api/client';
import {withTimeout} from '../../services/connectivityService';
import {colors, spacing} from '../../theme';
import {useT} from '../../i18n';
import {version as APP_VERSION} from '../../../package.json';

function formatBytes(bytes: number): string {
  const units = [
    [1024 * 1024 * 1024, 'Go'],
    [1024 * 1024, 'Mo'],
  ] as const;
  for (const [size, unit] of units) {
    if (bytes >= size) return `${(bytes / size).toFixed(1).replace('.', ',')} ${unit}`;
  }
  return `${Math.round(bytes / 1024)} Ko`;
}

/** `https://music.example.com/` → `music.example.com`. */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

const PAGE_MS = 220;

type Props = {visible: boolean; onClose: () => void};

export default function ProfileSheet({visible, onClose}: Props) {
  const t = useT();
  const navigation = useNavigation<any>();
  const servers = useSettingsStore(s => s.servers);
  const activeId = useSettingsStore(s => s.activeServerId);
  const setActiveServer = useSettingsStore(s => s.setActiveServer);
  const disconnectServer = useSettingsStore(s => s.disconnectServer);
  const isOffline = useSettingsStore(s => s.isOfflineMode);
  const setOfflineMode = useSettingsStore(s => s.setOfflineMode);
  const storageBytes = useDownloadStore(s => s.getTotalSizeBytes());
  const [pinging, setPinging] = useState(false);
  const [page, setPage] = useState<'main' | 'accounts'>('main');
  /** Set after the first page change, so the first opening does not slide. */
  const [navigated, setNavigated] = useState(false);
  const isLandscape = useIsLandscape();
  // Heights measured on the main page, so the accounts page keeps the same sheet height.
  const [identityH, setIdentityH] = useState(0);
  const [mainH, setMainH] = useState(0);
  const [accountsHeaderH, setAccountsHeaderH] = useState(0);
  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
    set(Math.round(e.nativeEvent.layout.height));

  // Always reopen on the main page.
  useEffect(() => {
    if (!visible) {
      setPage('main');
      setNavigated(false);
    }
  }, [visible]);

  const showPage = (next: 'main' | 'accounts') => {
    setNavigated(true);
    setPage(next);
  };

  const active = servers.find(s => s.id === activeId) ?? null;

  const go = (screen: string) => {
    onClose();
    navigation.navigate(screen);
  };

  const setOffline = async (offline: boolean) => {
    if (offline) {
      setOfflineMode(true);
      return;
    }
    if (!active || pinging) return;
    setPinging(true);
    try {
      await withTimeout(pingServer(active), 5000);
      setOfflineMode(false);
    } catch {
      toast.error(t.drawer.pingFailed);
    } finally {
      setPinging(false);
    }
  };

  const logout = () =>
    Alert.alert(t.drawer.logoutTitle, t.drawer.logoutMessage(active?.name ?? '', active?.url ?? ''), [
      {text: t.drawer.cancelButton, style: 'cancel'},
      {
        text: t.drawer.logoutConfirm,
        style: 'destructive',
        onPress: () => {
          onClose();
          disconnectServer();
        },
      },
    ]);

  const identity = active ? (
    <View style={[styles.identity, isLandscape && styles.identitySide]} onLayout={measure(setIdentityH)}>
      <ArtistAvatar name={active.username} size={72} />
      <Text variant="title2" numberOfLines={1}>
        {active.username}
      </Text>
      <Text variant="footnote" color="textSecondary" numberOfLines={1}>
        {hostOf(active.url)}
      </Text>
    </View>
  ) : null;

  const accountsHeader = (
    <View style={styles.pageHeader} onLayout={measure(setAccountsHeaderH)}>
      <Pressable
        onPress={() => showPage('main')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.ui.profile}
        style={styles.back}>
        <BackArrowIcon size={20} color={colors.accent} />
        <Text variant="body" style={styles.backLabel}>
          {t.ui.profile}
        </Text>
      </Pressable>
      <Text variant="headline" accessibilityRole="header" style={styles.pageTitle}>
        {t.ui.accounts}
      </Text>
    </View>
  );

  const mainPage = (
    <>
      <ListGroup raised>
        <ListItem label={t.ui.accounts} accessory="chevron" onPress={() => showPage('accounts')} />
        <ListItem
          label={pinging ? t.drawer.goOnline : t.ui.offlineMode}
          toggle={{value: isOffline, onValueChange: setOffline}}
        />
        {storageBytes > 0 ? <ListItem label={t.ui.storage} value={formatBytes(storageBytes)} /> : null}
        <ListItem label={t.drawer.settings} accessory="chevron" onPress={() => go('Settings')} />
        {__DEV__ ? <ListItem label="Design" accessory="chevron" onPress={() => go('Design')} /> : null}
      </ListGroup>

      <ListGroup raised caption={t.ui.about} note={`Musonic v${APP_VERSION} · made by Doodz`}>
        <ListItem
          label={t.ui.website}
          accessory="chevron"
          onPress={() => Linking.openURL('https://doodzprog.github.io/Musonic/')}
        />
        <ListItem label="GitHub" accessory="chevron" onPress={() => Linking.openURL('https://github.com/DoodzProg/Musonic')} />
        <ListItem label="doodz.dev" accessory="chevron" onPress={() => Linking.openURL('https://doodz.dev')} />
      </ListGroup>

      <ListGroup raised>
        <ListItem label={t.drawer.logout} destructive onPress={logout} />
      </ListGroup>
    </>
  );

  const accountsPage = (
    <ListGroup raised>
      {servers.map(s => (
        <ListItem
          key={s.id}
          label={s.username}
          value={hostOf(s.url)}
          accessory={s.id === activeId ? <CheckIcon size={20} color={colors.accent} /> : undefined}
          onPress={() => {
            if (s.id === activeId) return;
            setActiveServer(s.id);
            onClose();
          }}
        />
      ))}
      <ListItem
        label={t.ui.addAccount}
        accessory="chevron"
        onPress={() => {
          onClose();
          disconnectServer();
        }}
      />
    </ListGroup>
  );

  // In landscape the headers sit beside the content, so only the content counts.
  const accountsMinH = isLandscape ? mainH : Math.max(0, identityH + mainH - accountsHeaderH - styles.pageHeader.marginBottom);

  const entering = navigated
    ? (page === 'accounts' ? SlideInRight : SlideInLeft).duration(PAGE_MS)
    : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      scrollable
      headerSide={isLandscape}
      header={
        <Animated.View key={page} entering={entering}>
          {page === 'main' ? identity : accountsHeader}
        </Animated.View>
      }>
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View
          key={page}
          entering={entering}
          onLayout={page === 'main' ? measure(setMainH) : undefined}
          style={[styles.page, page === 'accounts' && {minHeight: accountsMinH}]}>
          {page === 'main' ? mainPage : accountsPage}
        </Animated.View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {paddingHorizontal: spacing.m, paddingBottom: spacing.m},
  page: {gap: spacing.l},
  identity: {alignItems: 'center', gap: spacing.xs, paddingTop: spacing.s, paddingBottom: spacing.l},
  identitySide: {paddingHorizontal: spacing.m},
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.s,
  },
  back: {position: 'absolute', left: spacing.m, flexDirection: 'row', alignItems: 'center', gap: 2},
  backLabel: {color: colors.accent},
  pageTitle: {textAlign: 'center'},
});
