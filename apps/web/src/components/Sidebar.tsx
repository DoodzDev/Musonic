/**
 * @file Sidebar.tsx
 * @description Left navigation: brand, profile menu, Home / Search / Library (icons filled
 *   when active, like the mobile tab bar), liked songs and the user's playlists.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { NavLink } from 'react-router';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { fr } from '../i18n/fr.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { HomeIcon } from './icons/HomeIcon.tsx';
import { LibraryIcon } from './icons/LibraryIcon.tsx';
import { SearchIcon } from './icons/SearchIcon.tsx';
import { LikedCover } from './LikedCover.tsx';
import { LogoIcon } from './icons/LogoIcon.tsx';
import { ProfileMenu } from './ProfileMenu.tsx';

const t = fr.nav;

function Playing() {
  const { playing } = usePlayer();
  return <Equalizer playing={playing} label={fr.table.nowPlaying} />;
}

export function Sidebar() {
  const { client } = useApp();
  const { sourceId } = usePlayer();
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const linkClass = ({ isActive }: { isActive: boolean }) => 'playlist-item' + (isActive ? ' is-selected' : '');

  return (
    <nav className="sidebar" aria-label={t.main}>
      <div className="sidebar-head">
        <NavLink to="/" className="brand" aria-label={t.home}>
          <LogoIcon size={32} />
          <span className="brand-name">Musonic</span>
        </NavLink>
        <ProfileMenu />
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
        <li>
          <NavLink to="/liked" className={linkClass}>
            <LikedCover size={40} className="cover-40" />
            <span className="item-text">
              <span className={'item-title' + (sourceId === 'liked' ? ' is-playing' : '')}>{t.likedSongs}</span>
            </span>
            {sourceId === 'liked' && <Playing />}
          </NavLink>
        </li>
        {playlists.status === 'ready' &&
          playlists.data.map((p) => {
            const playing = sourceId === `playlist:${p.id}`;
            return (
              <li key={p.id}>
                <NavLink to={`/playlist/${p.id}`} className={linkClass}>
                  <Cover coverArt={p.coverArt} size={40} className="cover-40" />
                  <span className="item-text">
                    <span className={'item-title' + (playing ? ' is-playing' : '')}>{p.name}</span>
                    <span className="item-sub">{t.titles(p.songCount)}</span>
                  </span>
                  {playing && <Playing />}
                </NavLink>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
