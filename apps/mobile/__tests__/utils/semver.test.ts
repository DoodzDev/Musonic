/**
 * @file semver.test.ts
 * @description Unit tests for the semantic version comparison used by the update checker.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {isNewerVersion} from '../../src/utils/semver';

describe('isNewerVersion', () => {
  it('detects a newer patch, minor and major version', () => {
    expect(isNewerVersion('1.0.4', '1.0.3')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false for equal or older versions', () => {
    expect(isNewerVersion('1.0.3', '1.0.3')).toBe(false);
    expect(isNewerVersion('1.0.2', '1.0.3')).toBe(false);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false);
  });

  it('ignores a leading "v" (GitHub tag format)', () => {
    expect(isNewerVersion('v1.0.4', '1.0.3')).toBe(true);
    expect(isNewerVersion('v1.0.3', 'v1.0.3')).toBe(false);
  });

  it('compares numerically, not as strings', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
  });
});
