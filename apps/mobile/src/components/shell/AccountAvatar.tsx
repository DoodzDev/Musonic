/**
 * @file AccountAvatar.tsx
 * @description Design v2 account avatar: an accent disc with the account's
 *   initial in the dark on-accent colour, so it reads as the user's own
 *   button (header avatars, Profile sheet) rather than as artist art. The
 *   reflections of the mini player and the Dock (bright top line + fine
 *   outline), tuned for the orange disc where white shows less, plus a faint
 *   darker bottom line for depth, and their black drop shadow scaled down:
 *   it reads as a slightly raised button. Never a coloured or blurred glow.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Text from '../ui/Text';
import {colors} from '../../theme';

type Props = {name: string; size: number};

function AccountAvatar({name, size}: Props) {
  const round = {width: size, height: size, borderRadius: size / 2};
  return (
    <View style={[styles.disc, round]}>
      <Text variant="headline" style={[styles.initial, {fontSize: size * 0.42, lineHeight: size * 0.52}]}>
        {(name.trim().charAt(0) || '?').toUpperCase()}
      </Text>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, round, styles.edge]} />
    </View>
  );
}

export default React.memo(AccountAvatar);

const styles = StyleSheet.create({
  disc: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // The Dock's drop shadow (0 10 30 at 0.45), scaled to an avatar.
    boxShadow: '0px 4px 12px rgba(0,0,0,0.45)',
  },
  // Light from the top, faint shade at the bottom, fine outline: no glow.
  edge: {
    boxShadow:
      'inset 0px 1px 0px rgba(255,255,255,0.4), inset 0px -1px 0px rgba(0,0,0,0.18), inset 0px 0px 0px 0.5px rgba(255,255,255,0.12)',
  },
  initial: {color: colors.onAccent, fontWeight: '700'},
});
