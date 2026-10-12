/**
 * @file index.tsx
 * @description Server Setup screen. First-run onboarding: collects server URL,
 *   username and password, validates credentials against the Subsonic API, and
 *   persists the server configuration via settingsStore. Accounts already
 *   saved are listed so the user can switch back without logging in again.
 * @author DoodzProg
 * @version 1.1.0
 * @license MIT
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {darkTheme} from '../../theme';
import {pingServer} from '../../api/client';
import {useSettingsStore} from '../../store/settingsStore';
import type {Server} from '../../store/settingsStore';
import {useT, getT} from '../../i18n';

function friendlyError(e: any): string {
  const d = getT();
  const status = e?.response?.status;
  if (status === 401 || status === 403) {
    return d.serverSetup.errors.wrongCredentials;
  }
  if (status >= 400 && status < 500) {
    return d.serverSetup.errors.clientError(status);
  }
  if (status >= 500) {
    return d.serverSetup.errors.serverError(status);
  }
  const code = e?.code;
  if (code === 'ECONNABORTED') {
    return d.serverSetup.errors.timeout;
  }
  if (code === 'ERR_NETWORK' || e?.message?.toLowerCase().includes('network')) {
    return d.serverSetup.errors.unreachable;
  }
  return e?.message ?? d.serverSetup.errors.generic;
}

export default function ServerSetupScreen() {
  const t = useT();
  const [url, setUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const servers = useSettingsStore(s => s.servers);
  const addServer = useSettingsStore(s => s.addServer);
  const setActiveServer = useSettingsStore(s => s.setActiveServer);

  async function handleConnect() {
    if (!url.startsWith('http') || !username || !password) {
      Alert.alert(t.serverSetup.missingFieldsTitle, t.serverSetup.missingFieldsBody);
      return;
    }

    setLoading(true);
    setStatus('idle');
    setErrorMsg('');

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
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>{t.serverSetup.appName}</Text>
        <Text style={styles.subtitle}>{t.serverSetup.subtitle}</Text>

        {servers.length > 0 && (
          <View style={styles.saved}>
            <Text style={styles.label}>{t.serverSetup.savedAccounts}</Text>
            {servers.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.savedRow}
                onPress={() => setActiveServer(s.id)}
                accessibilityRole="button"
                activeOpacity={0.7}>
                <Text style={styles.savedText} numberOfLines={1}>
                  {s.username} · {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>{t.serverSetup.serverUrlLabel}</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder={t.serverSetup.serverUrlPlaceholder}
            placeholderTextColor={darkTheme.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
          />
          {url.startsWith('http://') && (
            <Text style={styles.httpWarning}>{t.serverSetup.httpWarning}</Text>
          )}

          <Text style={styles.label}>{t.serverSetup.usernameLabel}</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder={t.serverSetup.usernamePlaceholder}
            placeholderTextColor={darkTheme.textSecondary}
            autoCapitalize="none"
          />

          <Text style={styles.label}>{t.serverSetup.passwordLabel}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={darkTheme.textSecondary}
            secureTextEntry
          />

          {status === 'ok' && (
            <Text style={styles.success}>{t.serverSetup.successMessage}</Text>
          )}
          {status === 'error' && (
            <Text style={styles.error}>✗ {errorMsg}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>{t.serverSetup.connectButton}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: darkTheme.background},
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: darkTheme.accent,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: darkTheme.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {gap: 4},
  saved: {gap: 8, marginBottom: 16},
  savedRow: {
    backgroundColor: darkTheme.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  savedText: {
    fontSize: 16,
    fontWeight: '600',
    color: darkTheme.textPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: darkTheme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: darkTheme.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: darkTheme.textPrimary,
    borderWidth: 1,
    borderColor: darkTheme.border,
  },
  button: {
    backgroundColor: darkTheme.accent,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {opacity: 0.6},
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  success: {
    color: '#1DB954',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  error: {
    color: '#E84040',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  httpWarning: {
    color: '#F0A500',
    fontSize: 12,
    marginTop: 6,
  },
});
