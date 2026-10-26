/**
 * @file autoTree.test.ts
 * @description Unit tests of the Android Auto browse tree (ADR-015): node and
 *   track ids round-trip, and anything else is ignored; Liked songs comes
 *   first with its drawn tile, playlists and albums carry Play and Shuffle.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {
  albumItems,
  albumNodeId,
  artistItems,
  likedItem,
  parseNode,
  parseTrackRef,
  playlistItems,
  playlistNodeId,
  trackItems,
  trackMediaId,
} from '../../src/services/auto/autoTree';

describe('parseNode', () => {
  it('reads the fixed nodes and a playlist', () => {
    expect(parseNode('root')).toEqual({kind: 'root'});
    expect(parseNode('library')).toEqual({kind: 'library'});
    expect(parseNode('playlists')).toEqual({kind: 'playlists'});
    expect(parseNode(playlistNodeId('42'))).toEqual({kind: 'playlist', id: '42'});
  });

  it('reads albums, artists and downloads', () => {
    expect(parseNode('albums')).toEqual({kind: 'albums'});
    expect(parseNode('artists')).toEqual({kind: 'artists'});
    expect(parseNode('downloads')).toEqual({kind: 'downloads'});
    expect(parseNode('liked')).toEqual({kind: 'liked'});
    expect(parseNode(albumNodeId('3'))).toEqual({kind: 'album', id: '3'});
    expect(parseNode('artist:ar-9')).toEqual({kind: 'artist', id: 'ar-9'});
  });

  it('rejects empty ids, track ids and unknown nodes', () => {
    expect(parseNode('playlist:')).toEqual({kind: 'unknown'});
    expect(parseNode('playlist:42|7')).toEqual({kind: 'unknown'});
    expect(parseNode('genre:rock')).toEqual({kind: 'unknown'});
  });
});

describe('parseTrackRef', () => {
  it('round-trips a track in a playlist', () => {
    const id = trackMediaId(playlistNodeId('42'), '1337');
    expect(id).toBe('playlist:42|1337');
    expect(parseTrackRef(id)).toEqual({list: {kind: 'playlist', id: '42'}, trackId: '1337'});
  });

  it('keeps ids that contain a colon', () => {
    expect(parseTrackRef('playlist:a:b|ext-9')).toEqual({list: {kind: 'playlist', id: 'a:b'}, trackId: 'ext-9'});
  });

  it('reads tracks of an album and of the downloads', () => {
    expect(parseTrackRef('album:3|7')).toEqual({list: {kind: 'album', id: '3'}, trackId: '7'});
    expect(parseTrackRef('downloads|7')).toEqual({list: {kind: 'downloads'}, trackId: '7'});
  });

  it('returns null for anything that is not a track', () => {
    expect(parseTrackRef('playlist:42')).toBeNull();
    expect(parseTrackRef('playlist:42|')).toBeNull();
    expect(parseTrackRef('|7')).toBeNull();
    expect(parseTrackRef('artist:3|7')).toBeNull();
  });
});

describe('items', () => {
  it('builds browsable playlists with their badge', () => {
    const items = playlistItems(
      [{id: '1', name: 'Route', songCount: 2}, {id: '2', name: 'Vide'}],
      n => `${n} titres`,
      id => id === '1',
      cover => (cover ? {key: cover, uri: `file:///c/${cover}.jpg`} : undefined),
    );
    expect(items).toEqual([
      {id: 'playlist:1', title: 'Route', subtitle: '2 titres', browsable: true, downloaded: true, actions: ['play', 'shuffle']},
      {id: 'playlist:2', title: 'Vide', subtitle: '0 titres', browsable: true, downloaded: false, actions: ['play', 'shuffle']},
    ]);
  });

  it('builds playable tracks that point back to their list', () => {
    const items = trackItems('playlist:1', [{id: '7', title: 'A', artist: 'X'}], () => false, () => undefined);
    expect(items).toEqual([{id: 'playlist:1|7', title: 'A', subtitle: 'X', downloaded: false}]);
  });

  it('builds albums and artists that open their content', () => {
    const artOf = (cover?: string) => (cover ? {key: cover, uri: `file:///c/${cover}.jpg`} : undefined);
    expect(albumItems([{id: '3', name: 'A', artist: 'X'}], artOf)).toEqual([
      {id: 'album:3', title: 'A', subtitle: 'X', browsable: true, actions: ['play', 'shuffle'], art: {key: '3', uri: 'file:///c/3.jpg'}},
    ]);
    expect(artistItems([{id: 'ar-9', name: 'X', coverArt: 'ar-9'}], artOf)).toEqual([
      {id: 'artist:ar-9', title: 'X', browsable: true, grid: true, art: {key: 'ar-9', uri: 'file:///c/ar-9.jpg'}},
    ]);
  });

  it('adds the cover, falling back to the track id like the app', () => {
    const artOf = (cover?: string) => (cover ? {key: cover, uri: `file:///c/${cover}.jpg`} : undefined);
    const [playlist] = playlistItems([{id: '1', name: 'R', coverArt: 'pl-1'}], String, () => false, artOf);
    expect(playlist.art).toEqual({key: 'pl-1', uri: 'file:///c/pl-1.jpg'});
    const [track] = trackItems('playlist:1', [{id: '7', title: 'A'}], () => false, artOf);
    expect(track.art).toEqual({key: '7', uri: 'file:///c/7.jpg'});
  });
});

describe('liked songs', () => {
  it('is a list with Play and Shuffle and the tile the app draws', () => {
    expect(likedItem('Titres likés', '3 titres', false)).toEqual({
      id: 'liked',
      title: 'Titres likés',
      subtitle: '3 titres',
      browsable: true,
      downloaded: false,
      actions: ['play', 'shuffle'],
      art: {key: 'res:liked', uri: ''},
    });
  });

  it('plays a tapped track from the whole list', () => {
    expect(parseTrackRef(trackMediaId('liked', '7'))).toEqual({list: {kind: 'liked'}, trackId: '7'});
  });
});
