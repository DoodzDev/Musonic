/**
 * @file releases.test.ts
 * @description Tests for the per-app release tag reading (mobile-v…, web-v…).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion, latestRelease, parseReleaseTag, type GitHubRelease } from './releases.ts';

const rel = (tag_name: string, extra: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag_name,
  html_url: `https://github.com/DoodzDev/Musonic/releases/tag/${tag_name}`,
  ...extra,
});

describe('parseReleaseTag', () => {
  it('reads the version of the right app only', () => {
    expect(parseReleaseTag('mobile-v1.0.7', 'mobile')).toBe('1.0.7');
    expect(parseReleaseTag('web-v0.1.0', 'web')).toBe('0.1.0');
    expect(parseReleaseTag('web-v0.1.0', 'mobile')).toBeNull();
    expect(parseReleaseTag('mobile-v1.0.7', 'web')).toBeNull();
  });

  it('rejects old bare tags and malformed versions', () => {
    expect(parseReleaseTag('v1.0.6', 'mobile')).toBeNull();
    expect(parseReleaseTag('mobile-v1.0', 'mobile')).toBeNull();
    expect(parseReleaseTag('mobile-v1.0.7-beta', 'mobile')).toBeNull();
    expect(parseReleaseTag('mobile-1.0.7', 'mobile')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.3', '1.0.3')).toBe(0);
    expect(compareVersions('1.0.2', '1.0.3')).toBeLessThan(0);
  });

  it('ignores a leading "v"', () => {
    expect(isNewerVersion('v1.0.4', '1.0.3')).toBe(true);
    expect(isNewerVersion('v1.0.3', 'v1.0.3')).toBe(false);
  });
});

describe('latestRelease', () => {
  it('keeps the newest release of the asked app, whatever the list order', () => {
    const list = [rel('web-v0.3.0'), rel('mobile-v1.0.6'), rel('mobile-v1.0.10'), rel('mobile-v1.0.9'), rel('web-v0.4.0')];
    expect(latestRelease(list, 'mobile')).toEqual({
      app: 'mobile',
      version: '1.0.10',
      tag: 'mobile-v1.0.10',
      url: 'https://github.com/DoodzDev/Musonic/releases/tag/mobile-v1.0.10',
    });
    expect(latestRelease(list, 'web')?.version).toBe('0.4.0');
  });

  it('never lets a web release stand in for a mobile one', () => {
    expect(latestRelease([rel('web-v9.0.0')], 'mobile')).toBeNull();
  });

  it('skips drafts, prereleases and tags without a name', () => {
    const list = [rel('mobile-v2.0.0', { draft: true }), rel('mobile-v1.9.0', { prerelease: true }), {}, rel('mobile-v1.0.7')];
    expect(latestRelease(list, 'mobile')?.version).toBe('1.0.7');
  });

  it('returns null for an empty list', () => {
    expect(latestRelease([], 'desktop')).toBeNull();
  });
});
