/**
 * @file MusonicApiGroup.tsx
 * @description Settings group of the optional Musonic API (ADR-016): address
 *   and key, checked against the API before they are saved, with the result
 *   said plainly. "Stop using it" clears them; playback then goes back to the
 *   usual server only.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {ListGroup} from '../../components/ui/ListGroup';
import TextField from '../../components/ui/TextField';
import Button from '../../components/ui/Button';
import Text from '../../components/ui/Text';
import {AlertIcon, CheckIcon} from '../../components/icons';
import {checkMusonicApi, type MusonicApiStatus} from '../../api/musonicApi';
import {useSettingsStore} from '../../store/settingsStore';
import {colors, spacing} from '../../theme';
import {useT} from '../../i18n';

export default function MusonicApiGroup() {
  const t = useT().settings.musonicApi;
  const savedUrl = useSettingsStore(s => s.musonicApiUrl);
  const savedKey = useSettingsStore(s => s.musonicApiKey);
  const setMusonicApi = useSettingsStore(s => s.setMusonicApi);
  const [url, setUrl] = useState(savedUrl || 'https://');
  const [key, setKey] = useState(savedKey);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<MusonicApiStatus | null>(null);
  const configured = savedUrl !== '' && savedKey !== '';

  const save = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const result = await checkMusonicApi({url, key});
      if (result === 'ok') {
        setMusonicApi(url, key);
        await checkMusonicApi();
      }
      setStatus(result);
    } finally {
      setChecking(false);
    }
  };

  const remove = () => {
    setMusonicApi('', '');
    checkMusonicApi();
    setUrl('https://');
    setKey('');
    setStatus(null);
  };

  const ok = status === 'ok';
  return (
    <ListGroup caption={t.sectionTitle} note={t.note}>
      <View style={styles.form}>
        <TextField
          label={t.urlLabel}
          value={url}
          onChangeText={setUrl}
          placeholder={t.urlPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextField
          label={t.keyLabel}
          value={key}
          onChangeText={setKey}
          placeholder="••••••••"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        {checking || status ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            {checking ? null : ok
              ? <CheckIcon size={16} color={colors.success} strokeWidth={2.4} />
              : <AlertIcon size={16} color={colors.destructive} triangle />}
            <Text
              variant="footnote"
              style={[styles.statusText, {color: checking ? colors.textSecondary : ok ? colors.success : colors.destructive}]}>
              {checking ? t.checking : t.status[status ?? 'notConfigured']}
            </Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button variant="filled" label={t.save} onPress={save} disabled={checking} haptic="light" />
          {configured ? <Button variant="plain" label={t.remove} onPress={remove} disabled={checking} /> : null}
        </View>
      </View>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  form: {padding: spacing.m, gap: spacing.m},
  status: {flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  statusText: {flexShrink: 1},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s},
});
