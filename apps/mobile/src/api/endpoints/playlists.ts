/**
 * @file playlists.ts
 * @description Subsonic playlist API endpoints: list, get, create, update,
 *   replace (full reorder/removal), and delete playlists.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {subsonicGet} from '../client';
import type {SubsonicPlaylist, SubsonicSong} from '../types';

export async function getPlaylists(): Promise<SubsonicPlaylist[]> {
  const res = await subsonicGet<any>('getPlaylists.view');
  return res.playlists?.playlist ?? [];
}

export async function getPlaylist(id: string): Promise<{playlist: SubsonicPlaylist; songs: SubsonicSong[]}> {
  const res = await subsonicGet<any>('getPlaylist.view', {id});
  return {
    playlist: res.playlist,
    songs: res.playlist?.entry ?? [],
  };
}

export async function createPlaylist(name: string, songIds: string[] = []): Promise<SubsonicPlaylist> {
  const res = await subsonicGet<any>('createPlaylist.view', {
    name,
    songId: songIds,
  });
  return res.playlist;
}

export async function updatePlaylist(
  id: string,
  name?: string,
  songIdsToAdd?: string[],
  songIndexesToRemove?: number[],
  comment?: string,
) {
  const params: Record<string, unknown> = {playlistId: id};
  if (name !== undefined) params.name = name;
  if (comment !== undefined) params.comment = comment;
  if (songIdsToAdd?.length) params.songIdToAdd = songIdsToAdd;
  if (songIndexesToRemove?.length) params.songIndexToRemove = songIndexesToRemove;
  await subsonicGet('updatePlaylist.view', params);
}

export async function replacePlaylist(id: string, songIds: string[]): Promise<void> {
  await subsonicGet('createPlaylist.view', {
    playlistId: id,
    songId: songIds,
  });
}

export async function deletePlaylist(id: string) {
  await subsonicGet('deletePlaylist.view', {id});
}
