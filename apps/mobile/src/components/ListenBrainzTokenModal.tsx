/**
 * @file ListenBrainzTokenModal.tsx
 * @description Sheet where the user pastes their ListenBrainz token (Settings ›
 *   Scrobbling). The server checks it with ListenBrainz before keeping it.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Text from './ui/Text';
import TextField from './ui/TextField';
import Button from './ui/Button';
import {colors, radii, spacing} from '../theme';
import {useT} from '../i18n';
import {connectListenBrainz, ScrobblingError, type ScrobblingState} from '../services/scrobbling';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConnected: (state: ScrobblingState) => void;
};

export default function ListenBrainzTokenModal({visible, onClose, onConnected}: Props) {
  const t = useT();
  const s = t.settings.scrobbling;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setToken('');
    setError(null);
    onClose();
  };
  const connect = () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    connectListenBrainz(token)
      .then(state => {
        setToken('');
        onConnected(state);
      })
      .catch(e => setError(e instanceof ScrobblingError && e.status === 422 ? s.tokenRefused : s.failed))
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.ui.close} style={[StyleSheet.absoluteFill, styles.dim]} onPress={close} />
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <Text variant="title3" style={styles.title}>{s.listenbrainzTitle}</Text>
          <Text variant="footnote" color="textSecondary">{s.tokenHint}</Text>
          <TextField
            label={s.token}
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={connect}
          />
          {error ? <Text variant="footnote" style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Button variant="plain" label={s.cancel} onPress={close} />
            <Button variant="filled" label={busy ? s.checking : s.connect} onPress={connect} disabled={busy || !token.trim()} />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {backgroundColor: colors.backdrop},
  wrap: {flex: 1, justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.l,
    gap: spacing.m,
  },
  title: {fontWeight: '700'},
  error: {color: colors.destructive},
  buttons: {flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s},
});
