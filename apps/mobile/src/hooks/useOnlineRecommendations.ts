/**
 * @file useOnlineRecommendations.ts
 * @description Online parts of the Home that the shared engine does not
 *   cover: "For you" (albums found online from the artists you played
 *   recently, shown with the "Online" badge) and "Artists to discover"
 *   (similar artists you do not have yet). Same sources as the former Home;
 *   seeded by the home feed, fetched once per session and never offline.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useState} from 'react';
import {getSimilarArtists} from '../api/endpoints/library';
import {
  enrichTracksWithAlbumType,
  getArtistImage,
  getDeezerArtistId,
  getDeezerArtistTopTracks,
  type DeezerTrack,
} from '../api/deezer';
import type {SubsonicSimilarArtist} from '../api/types';
import {useSettingsStore} from '../store/settingsStore';

export type DiscoverArtist = SubsonicSimilarArtist & {artistImageUrl?: string};

export type OnlineRecommendations = {
  /** One track per album, the album standing for the card. */
  forYou: DeezerTrack[];
  discover: DiscoverArtist[];
  /** Artists the "For you" albums come from (subtitle). */
  basedOn: string[];
};

const EMPTY: OnlineRecommendations = {forYou: [], discover: [], basedOn: []};
const FOR_YOU_SIZE = 10;
const DISCOVER_SIZE = 12;

let session: {seed: string; recos: OnlineRecommendations} | null = null;

/** Large version of a Deezer cover (the API gives 250 px; cards need more). */
export function largeDeezerCover(url: string): string {
  return url.replace(/\/\d+x\d+-/, '/1000x1000-');
}

async function load(artistNames: string[], artistIds: string[]): Promise<OnlineRecommendations> {
  const [similar, topTracks] = await Promise.all([
    Promise.all(artistIds.map(id => getSimilarArtists(id, 8).catch(() => [] as SubsonicSimilarArtist[]))),
    Promise.all(artistNames.map(async name => {
      const id = await getDeezerArtistId(name).catch(() => null);
      return id ? getDeezerArtistTopTracks(id, 8).catch(() => [] as DeezerTrack[]) : [];
    })),
  ]);

  const seenArtists = new Set<string>();
  const discoverRaw = similar.flat().filter(a => {
    if (a.present || seenArtists.has(a.id)) return false;
    seenArtists.add(a.id);
    return true;
  }).slice(0, DISCOVER_SIZE);

  const seenTracks = new Set<number>();
  const tracks = topTracks.flat().filter(t => !seenTracks.has(t.id) && seenTracks.add(t.id)).slice(0, 25);

  const [discover, enriched] = await Promise.all([
    Promise.all(discoverRaw.map(async a => ({...a, artistImageUrl: (await getArtistImage(a.name).catch(() => null)) ?? undefined}))),
    enrichTracksWithAlbumType(tracks),
  ]);

  const seenAlbums = new Set<number>();
  const forYou = enriched
    .filter(t => !t.isSingle && !seenAlbums.has(t.album.id) && seenAlbums.add(t.album.id))
    .slice(0, FOR_YOU_SIZE);

  return {forYou, discover, basedOn: artistNames.slice(0, 2)};
}

export function useOnlineRecommendations(artistNames: string[], artistIds: string[]): OnlineRecommendations {
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const seed = `${artistNames.join('|')}#${artistIds.join('|')}`;
  const [recos, setRecos] = useState<OnlineRecommendations>(() => (session?.seed === seed ? session.recos : EMPTY));

  useEffect(() => {
    if (isOfflineMode || (artistNames.length === 0 && artistIds.length === 0)) return;
    if (session?.seed === seed) { setRecos(session.recos); return; }
    let cancelled = false;
    load(artistNames, artistIds)
      .then(r => {
        session = {seed, recos: r};
        if (!cancelled) setRecos(r);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // artistNames / artistIds are summed up by `seed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, isOfflineMode]);

  return isOfflineMode ? EMPTY : recos;
}
