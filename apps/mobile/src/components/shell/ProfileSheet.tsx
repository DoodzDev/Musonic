/**
 * @file ProfileSheet.tsx
 * @description Design v2 Profile sheet, replacing the side drawer (ADR-010
 *   B2-B3): the account, offline mode, storage used, Settings, the Design
 *   screen (debug builds only), About and log out (asked first; revokes the
 *   device key and forgets the account, ADR-021). One account per phone: no
 *   switching. About (version, the project's and the creator's websites) is a
 *   second page of the same sheet, kept as tall as the main page. The identity
 *   block is the sheet's fixed header, so swiping down on it closes the sheet;
 *   in landscape it moves to a column on the left.
 * @author DoodzProg
 * @version 1.5.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useState} from 'react';
import {Alert, Linking, Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {SlideInLeft, SlideInRight} from 'react-native-reanimated';
import {ScrollView} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import Sheet from '../ui/Sheet';
import Text from '../ui/Text';
import AccountAvatar from './AccountAvatar';
import {ListGroup, ListItem} from '../ui/ListGroup';
import {toast} from '../ui/Toast';
import BackArrowIcon from '../icons/BackArrowIcon';
import {useSettingsStore} from '../../store/settingsStore';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useDownloadStore} from '../../store/downloadStore';
import {pingServer} from '../../api/client';
import {revokeDeviceKey} from '../../api/accountAuth';
import {scrubStorage} from '../../store/scrubStorage';
import {withTimeout} from '../../services/connectivityService';
import {colors, spacing} from '../../theme';
import {useT} from '../../i18n';
import {hostOf} from '../../utils/hostOf';
import {formatBytes} from '../../utils/formatBytes';
import {version as APP_VERSION} from '../../../package.json';


const PAGE_MS = 220;

type Props = {visible: boolean; onClose: () => void};

export default function ProfileSheet({visible, onClose}: Props) {
  const t = useT();
  const navigation = useNavigation<any>();
  const servers = useSettingsStore(s => s.servers);
  const activeId = useSettingsStore(s => s.activeServerId);
  const disconnectServer = useSettingsStore(s => s.disconnectServer);
  const removeServer = useSettingsStore(s => s.removeServer);
  const isOffline = useSettingsStore(s => s.isOfflineMode);
  const setOfflineMode = useSettingsStore(s => s.setOfflineMode);
  const storageBytes = useDownloadStore(s => s.getTotalSizeBytes());
  const [pinging, setPinging] = useState(false);
  const [page, setPage] = useState<'main' | 'about'>('main');
  /** Set after the first page change, so the first opening does not slide. */
  const [navigated, setNavigated] = useState(false);
  const isLandscape = useIsLandscape();
  // Heights measured on the main page, so the About page keeps the same sheet height.
  const [identityH, setIdentityH] = useState(0);
  const [mainH, setMainH] = useState(0);
  const [aboutHeaderH, setAboutHeaderH] = useState(0);
  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
    set(Math.round(e.nativeEvent.layout.height));

  // Always reopen on the main page.
  useEffect(() => {
    if (!visible) {
      setPage('main');
      setNavigated(false);
    }
  }, [visible]);

  const showPage = (next: 'main' | 'about') => {
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
    Alert.alert(t.drawer.logoutTitle, t.drawer.logoutMessage(active?.username ?? '', active ? hostOf(active.url) : ''), [
      {text: t.drawer.cancelButton, style: 'cancel'},
      {
        text: t.drawer.logoutConfirm,
        style: 'destructive',
        onPress: () => {
          onClose();
          // A real logout: the device key is revoked and the account forgotten (ADR-021).
          if (active) {
            revokeDeviceKey(active);
            removeServer(active.id);
          }
          disconnectServer();
          // An account kept with its password (server refusing tokens) leaves no trace of it.
          if (active?.password) scrubStorage().catch(() => {});
        },
      },
    ]);

  const identity = active ? (
    <View style={[styles.identity, isLandscape && styles.identitySide]} onLayout={measure(setIdentityH)}>
      <AccountAvatar name={active.username} size={72} />
      <Text variant="title2" numberOfLines={1}>
        {active.username}
      </Text>
      <Text variant="footnote" color="textSecondary" numberOfLines={1}>
        {hostOf(active.url)}
      </Text>
    </View>
  ) : null;

  const aboutHeader = (
    <View style={styles.pageHeader} onLayout={measure(setAboutHeaderH)}>
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
        {t.ui.about}
      </Text>
    </View>
  );

  const mainPage = (
    <>
      <ListGroup raised>
        <ListItem
          label={pinging ? t.drawer.goOnline : t.ui.offlineMode}
          toggle={{value: isOffline, onValueChange: setOffline}}
        />
        {storageBytes > 0 ? <ListItem label={t.ui.storage} value={formatBytes(storageBytes)} /> : null}
        <ListItem label={t.drawer.settings} accessory="chevron" onPress={() => go('Settings')} />
        {__DEV__ ? <ListItem label="Design" accessory="chevron" onPress={() => go('Design')} /> : null}
        <ListItem label={t.ui.about} accessory="chevron" onPress={() => showPage('about')} />
      </ListGroup>

      <ListGroup raised>
        <ListItem label={t.drawer.logout} destructive onPress={logout} />
      </ListGroup>
    </>
  );

  const aboutPage = (
    <ListGroup raised note="Musonic · made by Doodz">
      <ListItem label={t.ui.version} value={APP_VERSION} />
      <ListItem label={t.ui.projectSite} accessory="chevron" onPress={() => Linking.openURL('https://musonic.doodz.dev/')} />
      <ListItem label={t.ui.creatorSite} accessory="chevron" onPress={() => Linking.openURL('https://doodz.dev')} />
    </ListGroup>
  );

  // In landscape the headers sit beside the content, so only the content counts.
  const aboutMinH = isLandscape ? mainH : Math.max(0, identityH + mainH - aboutHeaderH - styles.pageHeader.marginBottom);

  const entering = navigated
    ? (page === 'about' ? SlideInRight : SlideInLeft).duration(PAGE_MS)
    : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      scrollable
      headerSide={isLandscape}
      header={
        <Animated.View key={page} entering={entering}>
          {page === 'main' ? identity : aboutHeader}
        </Animated.View>
      }>
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View
          key={page}
          entering={entering}
          onLayout={page === 'main' ? measure(setMainH) : undefined}
          style={[styles.page, page === 'about' && {minHeight: aboutMinH}]}>
          {page === 'main' ? mainPage : aboutPage}
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
