/**
 * @file SettingsButton.tsx
 * @description Gear beside the profile button in the tab headers: opens Settings
 *   in one touch (they were only in the profile sheet, behind an unlabelled
 *   initial, AUD-014 UX-05).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {useNavigation} from '@react-navigation/native';
import PressableScale from '../ui/PressableScale';
import {GearIcon} from '../icons';
import {useT} from '../../i18n';
import {colors} from '../../theme';

const SIZE = 24;

export default function SettingsButton() {
  const t = useT();
  const navigation = useNavigation<any>();
  return (
    <PressableScale
      onPress={() => navigation.navigate('Settings')}
      // 24 dp drawn + 12 on each side: the 48 dp touch target.
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t.drawer.settings}>
      <GearIcon size={SIZE} color={colors.textPrimary} />
    </PressableScale>
  );
}
