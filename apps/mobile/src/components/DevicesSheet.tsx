/**
 * @file DevicesSheet.tsx
 * @description « Listen on » (Musonic Connect, ADR-019), opened from the full
 *   player's Devices button: the account's devices online; a tap moves
 *   playback there at the same second (« This phone » brings it here). Below,
 *   synced playback, its text saying what it does, and the note that the
 *   server's administrator can see playback (to help).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Sheet from './ui/Sheet';
import Text from './ui/Text';
import {ListGroup, ListItem} from './ui/ListGroup';
import {CheckIcon, ComputerIcon, PhoneIcon} from './icons';
import {colors, spacing} from '../theme';
import {useT} from '../i18n';
import {useConnectSnapshot} from '../services/connect/useConnect';
import {deviceId, elsewhereNow, isPlayingHere, moveTo, setSync} from '../services/connect/connectService';

type Props = {visible: boolean; onClose: () => void};

export default function DevicesSheet({visible, onClose}: Props) {
  const t = useT().connect;
  const snapshot = useConnectSnapshot();
  const me = deviceId();
  const elsewhere = elsewhereNow(snapshot);
  const playingOn = isPlayingHere() ? me : elsewhere?.playing ? elsewhere.device : null;
  const devices = [...snapshot.devices].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)));

  return (
    <Sheet visible={visible} onClose={onClose} title={t.title}>
      <View style={styles.body}>
        <ListGroup note={devices.length < 2 ? t.none : undefined}>
          {devices.map(d => {
            const on = d.id === playingOn;
            const Icon = d.kind === 'phone' || d.kind === 'car' ? PhoneIcon : ComputerIcon;
            const description = [
              d.id === me ? t.thisDevice : null,
              on ? t.playing : null,
              d.id === me && !on && elsewhere ? t.listenHere : null,
              d.alone ? t.alone : null,
            ].filter(Boolean).join(' · ');
            return (
              <ListItem
                key={d.id}
                label={d.name}
                description={description || undefined}
                icon={<Icon size={22} color={on ? colors.accent : colors.textPrimary} />}
                accessory={on ? <CheckIcon size={18} color={colors.accent} /> : undefined}
                onPress={on || !d.canPlay ? undefined : () => {
                  moveTo(d.id).catch(() => {});
                  onClose();
                }}
              />
            );
          })}
        </ListGroup>
        <ListGroup note={t.adminNotice}>
          <ListItem
            label={t.sync}
            description={snapshot.sync ? t.syncOn : t.syncOff}
            toggle={{value: snapshot.sync, onValueChange: setSync}}
          />
        </ListGroup>
        {elsewhere?.playing ? (
          <Text variant="footnote" style={styles.where}>
            {t.playingOn(snapshot.devices.find(d => d.id === elsewhere.device)?.name ?? '')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {gap: spacing.l, paddingHorizontal: spacing.gutter, paddingBottom: spacing.l},
  where: {color: colors.accent, textAlign: 'center'},
});
