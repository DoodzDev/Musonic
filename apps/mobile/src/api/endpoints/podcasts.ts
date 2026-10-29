/**
 * @file podcasts.ts
 * @description Podcasts of Musonic Server (ADR-023): the directory search
 *   (shows, and episodes where someone speaks), a show with its episodes
 *   (followed or not), following, and where the account stopped in an
 *   episode. Episodes play like songs (`pe-…` ids, `stream`).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {subsonicGet} from '../client';
import {resolveLocale} from '../../i18n';
import {useSettingsStore} from '../../store/settingsStore';

export type PodcastFound = {
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  imageUrl?: string;
  followed: boolean;
};

export type PodcastFoundEpisode = {
  id?: string;
  title: string;
  showTitle: string;
  showId: string;
  feedUrl: string;
  imageUrl?: string;
  publishDate?: string;
  duration?: number;
};

export type PodcastEpisode = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  publishDate?: string;
  duration?: number;
  coverArt?: string;
  /** Where the account stopped, ms. */
  position?: number;
  played?: boolean;
};

export type PodcastShow = {
  id: string;
  url: string;
  title: string;
  author?: string;
  description?: string;
  coverArt?: string;
  followed?: boolean;
  episode: PodcastEpisode[];
};

/** The directory of the country of the app's language, where local shows are listed. */
function country(): string {
  return resolveLocale(useSettingsStore.getState().locale) === 'fr' ? 'fr' : 'us';
}

export async function searchPodcasts(query: string): Promise<{shows: PodcastFound[]; episodes: PodcastFoundEpisode[]}> {
  const res = await subsonicGet<any>('searchPodcasts.view', {query, country: country()});
  return {shows: res.searchPodcasts?.podcast ?? [], episodes: res.searchPodcasts?.episode ?? []};
}

/** A show, followed or not: `url` reads one the server does not know yet. */
export async function getPodcastShow(show: {id?: string; url?: string}): Promise<PodcastShow> {
  const res = await subsonicGet<any>('getPodcastShow.view', show);
  return {...res.podcastShow, episode: res.podcastShow?.episode ?? []};
}

/** The shows the account follows (without their episodes). */
export async function getFollowedPodcasts(): Promise<PodcastShow[]> {
  const res = await subsonicGet<any>('getPodcasts.view', {includeEpisodes: false});
  return (res.podcasts?.channel ?? []).map((c: PodcastShow) => ({...c, episode: c.episode ?? []}));
}

export async function followPodcast(feedUrl: string): Promise<void> {
  await subsonicGet('createPodcastChannel.view', {url: feedUrl});
}

export async function unfollowPodcast(id: string): Promise<void> {
  await subsonicGet('deletePodcastChannel.view', {id});
}

/** Where the account stopped in an episode, kept for every device. */
export async function savePodcastPosition(id: string, positionMs: number): Promise<void> {
  await subsonicGet('savePodcastPosition.view', {id, position: Math.max(0, Math.round(positionMs))});
}

export function isEpisode(id: string | number | undefined | null): boolean {
  return String(id ?? '').startsWith('pe-');
}
