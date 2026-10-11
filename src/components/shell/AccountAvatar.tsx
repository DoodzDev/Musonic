/**
 * @file AccountAvatar.tsx
 * @description Design v2 account avatar: an accent disc with the account's
 *   initial in the dark on-accent colour, so it reads as the user's own
 *   button (header avatars, Profile sheet) rather than as artist art. A glass
 *   finish (light from the top, bright edge, soft accent glow) makes it look
 *   pressable.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Text from '../ui/Text';
import {colors} from '../../theme';

/** Light falling from the top, gone by the middle of the disc. */
const SHINE = ['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'];
const SHINE_STOPS = [0, 0.45, 0.6];

type Props = {name: string; size: number};

function AccountAvatar({name, size}: Props) {
  const round = {width: size, height: size, borderRadius: size / 2};
  return (
    <View style={[styles.disc, round]}>
      <LinearGradient pointerEvents="none" colors={SHINE} locations={SHINE_STOPS} style={[StyleSheet.absoluteFill, round]} />
      <Text variant="headline" style={[styles.initial, {fontSize: size * 0.42, lineHeight: size * 0.52}]}>
        {(name.trim().charAt(0) || '?').toUpperCase()}
      </Text>
    </View>
  );
}

export default React.memo(AccountAvatar);

const styles = StyleSheet.create({
  disc: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow:
      '0px 4px 12px rgba(255,107,53,0.35), inset 0px 1px 0px rgba(255,255,255,0.45), inset 0px 0px 0px 1px rgba(255,255,255,0.18)',
  },
  initial: {color: colors.onAccent, fontWeight: '700'},
});
