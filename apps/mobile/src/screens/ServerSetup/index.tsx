/**
 * @file index.tsx
 * @description Server Setup screen (Design v2, R5.9). First-run onboarding:
 *   the Musonic logo, the accounts already saved (to switch back without
 *   logging in again), then the server URL, username and password. The
 *   credentials are checked against the Subsonic API before the server is
 *   saved; a failure says plainly what to fix (F29), and a plain-HTTP
 *   address explains the risk (ISS-021).
 * @author DoodzProg
 * @version 2.0.1
 * @license CC-BY-NC-4.0
 */
import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Text from '../../components/ui/Text';
import Field from '../../components/ui/TextField';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import PressableScale from '../../components/ui/PressableScale';
import {AlertIcon, CheckIcon, LogoIcon} from '../../components/icons';
import {pingServer, PingError} from '../../api/client';
import {useSettingsStore, type Server} from '../../store/settingsStore';
import {colors, radii, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import {hostOf} from '../../utils/hostOf';

/** What to tell the user about a failed check. */
function friendlyError(e: unknown): string {
  const d = getT().serverSetup.errors;
  if (!(e instanceof PingError)) return d.generic;
  switch (e.kind) {
    case 'auth': return d.wrongCredentials;
    case 'timeout': return d.timeout;
    case 'unreachable': return d.unreachable;
    case 'notSubsonic': return d.notSubsonic;
    case 'http': return e.status && e.status >= 500 ? d.serverError(e.status) : d.clientError(e.status ?? 0);
    default: return `${d.generic} (${e.message})`;
  }
}

export default function ServerSetupScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const userRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const servers = useSettingsStore(s => s.servers);
  const addServer = useSettingsStore(s => s.addServer);
  const setActiveServer = useSettingsStore(s => s.setActiveServer);

  const ready = /^https?:\/\/.+/.test(url.trim()) && username.trim().length > 0 && password.length > 0;

  async function connect() {
    if (!ready) {
      setStatus('error');
      setMessage(t.serverSetup.missingFieldsBody);
      return;
    }
    setLoading(true);
    setStatus('idle');
    const candidate: Server = {
      id: Date.now().toString(),
      name: url.trim(),
      url: url.trim(),
      username: username.trim(),
      password: password.trim(),
    };
    try {
      await pingServer(candidate);
      addServer(candidate);
      setActiveServer(candidate.id);
      setStatus('ok');
      setMessage(t.serverSetup.successMessage);
    } catch (e) {
      setStatus('error');
      setMessage(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[styles.container, {paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl}]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <LogoIcon size={88} />
          <Text variant="largeTitle">{t.serverSetup.appName}</Text>
          <Text variant="subhead" color="textSecondary" style={styles.center}>{t.serverSetup.subtitle}</Text>
        </View>

        {servers.length > 0 ? (
          <ListGroup caption={t.serverSetup.savedAccounts}>
            {servers.map(s => (
              <ListItem key={s.id} label={s.username} value={hostOf(s.url)} accessory="chevron" onPress={() => setActiveServer(s.id)} />
            ))}
          </ListGroup>
        ) : null}

        <View style={styles.form}>
          <Field
            label={t.serverSetup.serverUrlLabel}
            value={url}
            onChangeText={setUrl}
            placeholder={t.serverSetup.serverUrlPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
            onSubmitEditing={() => userRef.current?.focus()}
          />
          {url.trim().startsWith('http://') ? (
            <View style={styles.notice}>
              <AlertIcon size={16} color={colors.textSecondary} triangle />
              <Text variant="footnote" color="textSecondary" style={styles.noticeText}>{t.serverSetup.httpWarning}</Text>
            </View>
          ) : null}
          <Field
            ref={userRef}
            label={t.serverSetup.usernameLabel}
            value={username}
            onChangeText={setUsername}
            placeholder={t.serverSetup.usernamePlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            ref={passwordRef}
            label={t.serverSetup.passwordLabel}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={connect}
          />

          {status !== 'idle' ? (
            <View style={styles.status} accessibilityLiveRegion="polite">
              {status === 'ok'
                ? <CheckIcon size={18} color={colors.success} strokeWidth={2.4} />
                : <AlertIcon size={18} color={colors.destructive} triangle />}
              <Text variant="subhead" style={[styles.statusText, {color: status === 'ok' ? colors.success : colors.destructive}]}>
                {message}
              </Text>
            </View>
          ) : null}

          <PressableScale
            onPress={connect}
            disabled={loading}
            haptic="light"
            accessibilityLabel={t.serverSetup.connectButton}
            style={[styles.button, !ready && styles.buttonDim]}>
            {loading ? <ActivityIndicator color={colors.onAccent} /> : (
              <Text variant="headline" style={styles.buttonText}>{t.serverSetup.connectButton}</Text>
            )}
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  container: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.l, gap: spacing.xl},
  brand: {alignItems: 'center', gap: spacing.s},
  center: {textAlign: 'center'},
  form: {gap: spacing.m},
  notice: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s, marginTop: -spacing.s, paddingHorizontal: 4},
  noticeText: {flex: 1},
  status: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s},
  statusText: {flexShrink: 1},
  button: {
    height: 52,
    marginTop: spacing.s,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDim: {opacity: 0.5},
  buttonText: {color: colors.onAccent},
});

