/**
 * @file ProfileButton.tsx
 * @description Design v2 round account avatar shown at the top right of the
 *   main screens (ADR-010 B2). Shows the active account's initial and opens
 *   the Profile sheet.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View} from 'react-native';
import PressableScale from '../ui/PressableScale';
import ArtistAvatar from '../ui/ArtistAvatar';
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
      {/* The button carries the label; hide the avatar's own "image" label. */}
      <View importantForAccessibility="no-hide-descendants">
        <ArtistAvatar name={username || '?'} size={SIZE} />
      </View>
    </PressableScale>
  );
}
