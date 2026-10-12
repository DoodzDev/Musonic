/**
 * @file Sidebar.tsx
 * @description Left navigation: brand, account and the user's playlists.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { Playlist, SubsonicClient } from '@musonic/core';
import { fr } from '../i18n/fr.ts';
import { EqualizerIcon, LogoutIcon } from './Icons.tsx';
import { Logo } from './Logo.tsx';

interface Props {
  client: SubsonicClient;
  username: string;
  playlists: Playlist[];
  selectedId: string | null;
  playingId: string | null;
  onSelect: (id: string) => void;
  onLogout: () => void;
}

const t = fr.sidebar;

export function Sidebar({ client, username, playlists, selectedId, playingId, onSelect, onLogout }: Props) {
  return (
    <nav className="sidebar" aria-label="Navigation principale">
      <div className="sidebar-head">
        <span className="brand">
          <Logo size={32} />
          <span className="brand-name">Musonic</span>
        </span>
        <span className="avatar" title={username} aria-label={username}>
          {username.slice(0, 1).toUpperCase()}
        </span>
      </div>

      <div className="separator" />

      <h2 className="section-label">{t.playlists}</h2>
      <ul className="playlist-list">
        {playlists.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={'playlist-item' + (p.id === selectedId ? ' is-selected' : '')}
              aria-current={p.id === selectedId ? 'page' : undefined}
              onClick={() => onSelect(p.id)}
            >
              <span className="cover cover-40">
                {p.coverArt && <img src={client.coverArtUrl(p.coverArt, 96)} alt="" loading="lazy" />}
              </span>
              <span className="item-text">
                <span className={'item-title' + (p.id === playingId ? ' is-playing' : '')}>{p.name}</span>
                <span className="item-sub">{t.titles(p.songCount)}</span>
              </span>
              {p.id === playingId && (
                <span className="accent" role="img" aria-label={fr.playlist.nowPlaying}>
                  <EqualizerIcon />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="logout" onClick={onLogout}>
        <LogoutIcon /> {t.logout}
      </button>
    </nav>
  );
}
