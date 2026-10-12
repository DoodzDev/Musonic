/**
 * @file ProfileButton.tsx
 * @description Design v2 round account avatar shown at the top right of the
 *   main screens (ADR-010 B2). Shows the active account's initial on an
 *   accent disc and opens the Profile sheet.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import AccountAvatar from './AccountAvatar';
import {useProfile} from '../ProfileProvider';
import {useSettingsStore} from '../../store/settingsStore';
import {useT} from '../../i18n';

const SIZE = 32;

export default function ProfileButton() {
  const t = useT();
  const {open} = useProfile();
  const username = useSettingsStore(
    s => s.servers.find(server => server.id === s.activeServerId)?.username ?? '',
  );

  return (
    <PressableScale onPress={open} hitSlop={8} accessibilityLabel={t.ui.profile}>
      <View importantForAccessibility="no-hide-descendants">
        <AccountAvatar name={username} size={SIZE} />
      </View>
    </PressableScale>
  );
}
