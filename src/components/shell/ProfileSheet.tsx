/**
 * @file ProfileSheet.tsx
 * @description Design v2 Profile sheet, replacing the side drawer (ADR-010
 *   B2-B3): active account and account switching, offline mode, storage used,
 *   Settings, the Design screen (debug builds only), about links and log out.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {Alert, Linking, StyleSheet, View} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import Sheet from '../ui/Sheet';
import Text from '../ui/Text';
import ArtistAvatar from '../ui/ArtistAvatar';
import {ListGroup, ListItem} from '../ui/ListGroup';
import {toast} from '../ui/Toast';
import CheckIcon from '../icons/CheckIcon';
import {useSettingsStore} from '../../store/settingsStore';
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

  return (
    <Sheet visible={visible} onClose={onClose} scrollable>
      <ScrollView contentContainerStyle={styles.body}>
        {active ? (
          <View style={styles.identity}>
            <ArtistAvatar name={active.username} size={72} />
            <Text variant="title2" numberOfLines={1}>
              {active.username}
            </Text>
            <Text variant="footnote" color="textSecondary" numberOfLines={1}>
              {active.name}
            </Text>
          </View>
        ) : null}

        <ListGroup raised caption={t.ui.accounts}>
          {servers.map(s => (
            <ListItem
              key={s.id}
              label={`${s.username} · ${s.name}`}
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

        <ListGroup raised>
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
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: spacing.l},
  identity: {alignItems: 'center', gap: spacing.xs, paddingTop: spacing.s},
});
