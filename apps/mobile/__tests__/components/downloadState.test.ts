/**
 * @file downloadState.test.ts
 * @description A track row's download state from the store's maps, failures included.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {downloadStateOf} from '../../src/components/ui/downloadState';

describe('downloadStateOf', () => {
  const downloads = {a: {}};
  const active = {b: {status: 'queued'}, c: {status: 'downloading'}, d: {status: 'error'}};

  it('reads done, in progress, failed and nothing', () => {
    expect(downloadStateOf('a', downloads, active)).toBe('done');
    expect(downloadStateOf('b', downloads, active)).toBe('downloading');
    expect(downloadStateOf('c', downloads, active)).toBe('downloading');
    expect(downloadStateOf('d', downloads, active)).toBe('failed');
    expect(downloadStateOf('e', downloads, active)).toBe('none');
  });
});
