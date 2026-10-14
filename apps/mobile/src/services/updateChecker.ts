/**
 * @file updateChecker.ts
 * @description Fetches the GitHub releases of the monorepo, keeps only the
 *   newest mobile one (`mobile-vX.Y.Z`, web and desktop releases are ignored)
 *   and compares it against the current app version. Presents an Alert with a
 *   deep-link to the release page when a newer version is found.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {Alert, Linking} from 'react-native';
import {
  isNewerVersion,
  latestRelease,
  type AppRelease,
  type GitHubRelease,
} from '@musonic/core/releases';
import {getT} from '../i18n';

const LOCAL_VERSION: string = require('../../package.json').version;
// `releases/latest` may point to a web or desktop release: read the list instead.
const GITHUB_API = 'https://api.github.com/repos/DoodzProg/Musonic/releases?per_page=50';
const FETCH_TIMEOUT_MS = 8000;

/** Newest published mobile release, or null if there is none. Throws on network/HTTP errors. */
async function fetchLatestMobileRelease(): Promise<AppRelease | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_API, {
      signal: controller.signal,
      headers: {Accept: 'application/vnd.github.v3+json'},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    return Array.isArray(json) ? latestRelease(json as GitHubRelease[], 'mobile') : null;
  } finally {
    clearTimeout(timer);
  }
}

function showNewVersion(release: AppRelease): void {
  const t = getT().settings.updates;
  Alert.alert(t.newVersionTitle, t.newVersionMessage(release.version), [
    {text: getT().playlistOptions.cancelButton, style: 'cancel'},
    {text: t.viewRelease, onPress: () => Linking.openURL(release.url)},
  ]);
}

export async function checkForUpdateSilent(): Promise<void> {
  try {
    const release = await fetchLatestMobileRelease();
    if (release && isNewerVersion(release.version, LOCAL_VERSION)) showNewVersion(release);
  } catch {
    // Silent check: no network, rate limit… try again next launch.
  }
}

export async function checkForUpdate(): Promise<void> {
  const t = getT().settings.updates;
  try {
    const release = await fetchLatestMobileRelease();
    if (!release) throw new Error('no mobile release');
    if (isNewerVersion(release.version, LOCAL_VERSION)) {
      showNewVersion(release);
    } else {
      Alert.alert(t.upToDateTitle, t.upToDateMessage(LOCAL_VERSION, release.version));
    }
  } catch {
    Alert.alert(t.upToDateTitle, t.error);
  }
}
