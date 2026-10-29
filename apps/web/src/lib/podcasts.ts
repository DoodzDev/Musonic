/**
 * @file podcasts.ts
 * @description Podcast episodes (ADR-023) played by the same player as songs:
 *   an episode becomes a song whose artist is its show, resumed where the
 *   account stopped. `pe-…` ids tell them apart.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { PodcastChannel, PodcastEpisode, Song } from '@musonic/core';

export function isEpisode(id: string | undefined): boolean {
  return !!id?.startsWith('pe-');
}

/** An episode as the player plays it (from the start again once listened to the end). */
export function episodeSong(episode: PodcastEpisode, show: Pick<PodcastChannel, 'title' | 'coverArt'>): Song {
  return {
    id: episode.id,
    title: episode.title,
    artist: show.title,
    album: show.title,
    duration: episode.duration,
    coverArt: episode.coverArt ?? show.coverArt,
    position: episode.played ? 0 : episode.position,
  };
}

/** Speeds offered for podcasts, in order. */
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
