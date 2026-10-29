/**
 * @file PodcastPage.tsx
 * @description A podcast show (ADR-023): its episodes, newest first, each
 *   resumed where the account stopped; Follow adds it to the Library. Opened
 *   from a search with `?feed=`, as the server may not know the show yet.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { PodcastChannel, PodcastEpisode } from '@musonic/core';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { episodeSong } from '../lib/podcasts.ts';
import { usePlayer } from '../player/PlayerContext.tsx';

const t = tr.podcasts;

function published(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function state(episode: PodcastEpisode): string {
  if (episode.played) return t.played;
  const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
  if (episode.duration && episode.position) return t.left(minutes(episode.duration - episode.position / 1000));
  return episode.duration ? t.minutes(minutes(episode.duration)) : '';
}

/** `wanted`: the episode opened from a search, shown and played once the show is loaded. */
function Episodes({ show, wanted }: { show: PodcastChannel; wanted?: string }) {
  const { playSongs, current } = usePlayer();
  const songs = show.episode.map((e) => episodeSong(e, show));
  const wantedRow = useRef<HTMLButtonElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const index = show.episode.findIndex((e) => e.id === wanted);
    if (index < 0 || started.current) return;
    started.current = true;
    wantedRow.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    playSongs([songs[index]], 0, `podcast:${show.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, wanted]);
  if (!show.episode.length) return <p className="muted">{t.noEpisodes}</p>;
  return (
    <section className="shelf">
      <header className="shelf-head"><h2>{t.episodes}</h2></header>
      <ol className="episode-list">
        {show.episode.map((episode, i) => (
          <li key={episode.id}>
            <button
              type="button"
              ref={episode.id === wanted ? wantedRow : undefined}
              className={
                'episode-row' + (current?.id === episode.id ? ' is-current' : '') + (episode.played ? ' is-played' : '') + (episode.id === wanted ? ' is-wanted' : '')
              }
              // Only this episode: the next one is the listener's choice.
              onClick={() => playSongs([songs[i]], 0, `podcast:${show.id}`)}
            >
              <span className="episode-date">{published(episode.publishDate)}</span>
              <span className="episode-title">{episode.title}</span>
              <span className="episode-state">{state(episode)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PodcastPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const feed = params.get('feed') ?? undefined;
  const { client, cache, session } = useApp();
  const { playSongs } = usePlayer();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const key = `podcast:${id}:${version}`;
  const query = useCachedQuery(key, TTL_SHORT, () => client.getPodcastShow(feed ? { url: feed } : { id }));

  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const show = query.data;

  async function toggleFollow() {
    setBusy(true);
    try {
      if (show.followed) await client.unfollowPodcast(show.id);
      else await client.followPodcast(show.url);
      cache.invalidate(`${session.username}|podcasts`);
      setVersion((v) => v + 1);
    } catch {
      window.alert(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={show.coverArt} size={208} className="cover-hero" eager />}
        eyebrow={tr.library.tabs.podcasts}
        title={show.title}
        meta={tr.page.meta([show.author, t.episodesCount(show.episode.length)])}
        onPlay={() => show.episode[0] && playFirst(show)}
        canPlay={show.episode.length > 0}
        extra={
          <button type="button" className={show.followed ? 'btn-tinted' : 'btn-primary'} onClick={() => void toggleFollow()} disabled={busy} aria-pressed={!!show.followed}>
            {show.followed ? t.following : t.follow}
          </button>
        }
      />
      {show.description && <p className="podcast-description">{show.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</p>}
      <Episodes show={show} wanted={params.get('episode') ?? undefined} />
    </div>
  );

  function playFirst(s: PodcastChannel) {
    // The newest episode not listened to yet, else the newest.
    const next = s.episode.find((e) => !e.played) ?? s.episode[0];
    playSongs([episodeSong(next, s)], 0, `podcast:${s.id}`);
  }
}
