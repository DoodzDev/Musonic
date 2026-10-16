/**
 * @file offlineCovers.test.ts
 * @description Unit tests for the covers saved with downloaded tracks (ISS-034):
 *   local registry read by getCoverArtUrl, shared cover kept until its last
 *   track is deleted, backfill of covers missing on older downloads.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
const mockFiles = new Set<string>();
const mockFetch = jest.fn();

// The toast pulls in Reanimated, which needs its native part.
jest.mock('../../src/components/ui/Toast', () => ({toast: {error: jest.fn()}}));
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: {DocumentDir: '/docs'},
    exists: async (p: string) => mockFiles.has(p),
    mkdir: async () => {},
    unlink: async (p: string) => { mockFiles.delete(p); },
    mv: async (from: string, to: string) => { mockFiles.delete(from); mockFiles.add(to); },
    stat: async () => ({size: 1000}),
  },
  config: ({path}: {path: string}) => ({
    fetch: (_method: string, url: string) => mockFetch(path, url),
  }),
}));
jest.mock('../../src/store/storage', () => ({
  mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
}));
jest.mock('../../src/store/networkStore', () => ({useNetworkStore: {getState: () => ({})}}));

import {configureClient, getCoverArtUrl} from '../../src/api/client';
import {useDownloadStore, type DownloadedTrack} from '../../src/store/downloadStore';
import {coverFilePath} from '../../src/store/localCovers';

/** A server answer: an image (cover found) or XML (Subsonic error with HTTP 200). */
function serverAnswers(contentType: string) {
  mockFetch.mockImplementation(async (path: string) => {
    mockFiles.add(path);
    return {info: () => ({status: 200, headers: {'Content-Type': contentType}})};
  });
}

const entry = (trackId: string, coverArt: string | undefined, coverSaved?: boolean): DownloadedTrack => ({
  trackId, localPath: `/docs/musonic/${trackId}.mp3`, title: trackId, artist: 'A', album: 'B',
  coverArt, coverSaved, duration: 1, fileSize: 1, downloadedAt: 0,
});

beforeAll(() => {
  configureClient({url: 'https://music.test', username: 'u', password: 'secret'} as never);
});

beforeEach(() => {
  mockFiles.clear();
  mockFetch.mockReset();
  useDownloadStore.setState({downloads: {}});
});

describe('offline covers', () => {
  it('serves the local file once a cover is saved, the server URL otherwise', () => {
    expect(getCoverArtUrl('al-1', 96)).toContain('https://music.test/rest/getCoverArt.view');
    useDownloadStore.setState({downloads: {t1: entry('t1', 'al-1', true)}});
    expect(getCoverArtUrl('al-1', 96)).toBe(`file://${coverFilePath('al-1')}`);
    expect(getCoverArtUrl('al-1', 600)).toBe(`file://${coverFilePath('al-1')}`);
    expect(getCoverArtUrl('al-2', 96)).toContain('https://');
  });

  it('turns any cover id into a safe file name', () => {
    expect(coverFilePath('mf-12/../x y')).toBe('/docs/musonic/covers/mf-12____x_y.jpg');
  });

  it('keeps a shared cover until its last downloaded track is deleted', async () => {
    const path = coverFilePath('al-1');
    mockFiles.add(path);
    useDownloadStore.setState({downloads: {t1: entry('t1', 'al-1', true), t2: entry('t2', 'al-1', true)}});

    await useDownloadStore.getState().deleteDownload('t1');
    expect(mockFiles.has(path)).toBe(true);
    expect(getCoverArtUrl('al-1')).toBe(`file://${path}`);

    await useDownloadStore.getState().deleteDownload('t2');
    expect(mockFiles.has(path)).toBe(false);
    expect(getCoverArtUrl('al-1')).toContain('https://');
  });

  it('backfills missing covers, keyed by the track id when there is no cover id', async () => {
    serverAnswers('image/jpeg');
    useDownloadStore.setState({downloads: {t1: entry('t1', 'al-1'), t2: entry('t2', undefined)}});

    await useDownloadStore.getState().backfillCovers();

    const {downloads} = useDownloadStore.getState();
    expect(downloads.t1.coverSaved).toBe(true);
    expect(downloads.t2.coverSaved).toBe(true);
    expect(mockFiles.has(coverFilePath('al-1'))).toBe(true);
    expect(mockFiles.has(coverFilePath('t2'))).toBe(true);
    expect(mockFetch.mock.calls[0][1]).toContain('size=600');
  });

  it('does not keep a Subsonic error answer as a cover', async () => {
    serverAnswers('text/xml');
    useDownloadStore.setState({downloads: {t1: entry('t1', 'al-1')}});

    await useDownloadStore.getState().backfillCovers();

    expect(useDownloadStore.getState().downloads.t1.coverSaved).toBeFalsy();
    expect(mockFiles.size).toBe(0);
  });
});
