/**
 * @file types.ts
 * @description React Navigation param-list type definitions for all stacks.
 * @author DoodzProg
 * @version 1.0.3
 * @license CC-BY-NC-4.0
 */
export type LibraryStackParams = {
  LibraryHome: undefined;
  LikedSongs: undefined;
  LikedRecommendations: undefined;
  AllSongs: undefined;
  PlaylistDetail: {playlistId: string; autoEdit?: boolean};
  AlbumDetail: {albumId: string};
  ArtistDetail: {artistId?: string; artistName?: string};
  /** A podcast show: by id, or by its feed when found in a search (ADR-023). */
  PodcastDetail: {showId: string; feedUrl?: string; episodeId?: string};
};

export type SearchStackParams = {
  SearchHome: undefined;
  SearchActive: undefined;
  ArtistDetail: {artistId?: string; artistName?: string};
  AlbumDetail: {albumId: string};
  PodcastDetail: {showId: string; feedUrl?: string; episodeId?: string};
};
