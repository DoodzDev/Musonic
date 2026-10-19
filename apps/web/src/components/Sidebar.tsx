/**
 * @file Sidebar.tsx
 * @description Left navigation: brand, profile menu, Home / Search / Library (icons filled
 *   when active, like the mobile tab bar), liked songs and the user's playlists,
 *   most recently played first. Hovering a cover shows a play button; playing
 *   a playlist moves it to the top and scrolls back up.
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { CardItem } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys, usePlayItem } from '../player/usePlayItem.ts';
import { markPlaylistPlayed, useRecentPlaylists } from '../lib/recentPlaylists.ts';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { HomeIcon } from './icons/HomeIcon.tsx';
import { LibraryIcon } from './icons/LibraryIcon.tsx';
import { SearchIcon } from './icons/SearchIcon.tsx';
import { LikedCover } from './LikedCover.tsx';
import { LogoIcon } from './icons/LogoIcon.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';

const t = tr.nav;

function Playing() {
  const { playing } = usePlayer();
  return <Equalizer playing={playing} label={tr.table.nowPlaying} />;
}

/** A playlist row: link to its page, with a play button over the cover on hover. */
function Row({ to, name, art, sub, playing, onPlay }: {
  to: string;
  name: string;
  art: ReactNode;
  sub?: string;
  playing: boolean;
  onPlay: () => void;
}) {
  const linkClass = ({ isActive }: { isActive: boolean }) => 'playlist-item' + (isActive ? ' is-selected' : '');
  return (
    <li className="playlist-row">
      <NavLink to={to} className={linkClass}>
        {art}
        <span className="item-text">
          <span className={'item-title' + (playing ? ' is-playing' : '')}>{name}</span>
          {sub && <span className="item-sub">{sub}</span>}
        </span>
        {playing && <Playing />}
      </NavLink>
      <button type="button" className="playlist-play" onClick={onPlay} aria-label={tr.card.play(name)} title={tr.card.play(name)}>
        <PlayIcon size={16} color="currentColor" />
      </button>
    </li>
  );
}

export function Sidebar() {
  const { client, session } = useApp();
  const { sourceId } = usePlayer();
  const playItem = usePlayItem();
  const navRef = useRef<HTMLElement>(null);
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const recent = useRecentPlaylists();
  const scope = `${session.username}@${session.baseUrl}|`;

  // Any playlist played (here, from its page or from a card) becomes the most recent.
  useEffect(() => {
    if (sourceId?.startsWith('playlist:')) markPlaylistPlayed(scope + sourceId.slice('playlist:'.length));
  }, [sourceId, scope]);

  const sorted =
    playlists.status === 'ready'
      ? playlists.data
          .map((p, i) => ({ p, i, at: recent[scope + p.id] ?? 0 }))
          .sort((a, b) => b.at - a.at || a.i - b.i)
          .map(({ p }) => p)
      : [];

  function play(item: CardItem) {
    void playItem(item);
    navRef.current?.closest('.side-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <nav className="sidebar" aria-label={t.main} ref={navRef}>
      <div className="sidebar-head">
        <NavLink to="/" className="brand" aria-label={t.home}>
          <LogoIcon size={32} />
          <span className="brand-name">Musonic</span>
        </NavLink>
      </div>

      <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}>
        {({ isActive }) => (
          <>
            <HomeIcon size={22} filled={isActive} /> {t.home}
          </>
        )}
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}>
        {({ isActive }) => (
          <>
            <SearchIcon size={22} filled={isActive} /> {t.search}
          </>
        )}
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}>
        {({ isActive }) => (
          <>
            <LibraryIcon size={22} filled={isActive} /> {t.library}
          </>
        )}
      </NavLink>

      <div className="separator" />

      <h2 className="section-label">{t.playlists}</h2>
      <ul className="playlist-list">
        <Row
          to="/liked"
          name={t.likedSongs}
          art={<LikedCover size={40} className="cover-40" />}
          playing={sourceId === 'liked'}
          onPlay={() => play({ type: 'liked', count: 0 })}
        />
        {sorted.map((p) => (
          <Row
            key={p.id}
            to={`/playlist/${p.id}`}
            name={p.name}
            art={<Cover coverArt={p.coverArt} size={40} className="cover-40" />}
            sub={t.titles(p.songCount)}
            playing={sourceId === `playlist:${p.id}`}
            onPlay={() => play({ type: 'playlist', playlist: p })}
          />
        ))}
      </ul>
    </nav>
  );
}
