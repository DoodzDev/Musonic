/**
 * @file updateChecker.ts
 * @description Fetches the latest GitHub release and compares it against the
 *   current app version using proper SemVer comparison. Presents an Alert with
 *   a deep-link to the release page when a newer version is found.
 * @author DoodzProg
 * @version 1.0.3
 * @license CC-BY-NC-4.0
 */
import {Alert, Linking} from 'react-native';
import {getT} from '../i18n';
import {isNewerVersion} from '../utils/semver';

const LOCAL_VERSION: string = require('../../package.json').version;
const GITHUB_API = 'https://api.github.com/repos/DoodzProg/Musonic/releases/latest';
const FETCH_TIMEOUT_MS = 8000;

export async function checkForUpdateSilent(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_API, {
      signal: controller.signal,
      headers: {Accept: 'application/vnd.github.v3+json'},
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const json = await res.json();
    const remoteTag: string = json.tag_name ?? '';
    const releaseUrl: string = json.html_url ?? '';
    if (!remoteTag || !isNewerVersion(remoteTag, LOCAL_VERSION)) return;
    const t = getT().settings.updates;
    Alert.alert(t.newVersionTitle, t.newVersionMessage(remoteTag), [
      {text: getT().playlistOptions.cancelButton, style: 'cancel'},
      {text: t.viewRelease, onPress: () => Linking.openURL(releaseUrl)},
    ]);
  } catch {
    clearTimeout(timer);
  }
}

export async function checkForUpdate(): Promise<void> {
  const t = getT().settings.updates;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(GITHUB_API, {
      signal: controller.signal,
      headers: {Accept: 'application/vnd.github.v3+json'},
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const remoteTag: string = json.tag_name ?? '';
    const releaseUrl: string = json.html_url ?? '';

    if (!remoteTag) throw new Error('no tag_name');

    if (isNewerVersion(remoteTag, LOCAL_VERSION)) {
      Alert.alert(t.newVersionTitle, t.newVersionMessage(remoteTag), [
        {text: getT().playlistOptions.cancelButton, style: 'cancel'},
        {text: t.viewRelease, onPress: () => Linking.openURL(releaseUrl)},
      ]);
    } else {
      Alert.alert(t.upToDateTitle, t.upToDateMessage(LOCAL_VERSION, remoteTag.replace(/^v/, '')));
    }
  } catch {
    clearTimeout(timer);
    Alert.alert(t.upToDateTitle, t.error);
  }
}
