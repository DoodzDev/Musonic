/**
 * @file Card.tsx
 * @description Home cards (square or round) and quick access tiles, with a play button on hover.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem, Song } from '@musonic/core';
import { Link } from 'react-router';
import { tr } from '../i18n/index.ts';
import { usePlayItem } from '../player/usePlayItem.ts';
import { describe } from './cardModel.ts';
import { Cover } from './Cover.tsx';
import { HeartIcon } from './icons/HeartIcon.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';
import { SparkleIcon } from './icons/SparkleIcon.tsx';
import { LikedCover } from './LikedCover.tsx';

const t = tr.card;

function Artwork({ item, size }: { item: CardItem; size: number }) {
  switch (item.type) {
    case 'album':
      return <Cover coverArt={item.album.coverArt} size={size} />;
    case 'artist':
      return <Cover coverArt={item.artist.coverArt} fallbackCoverArt={item.fallbackCoverArt} size={size} round placeholder={item.artist.name.slice(0, 1)} />;
    case 'playlist':
      return <Cover coverArt={item.playlist.coverArt} size={size} />;
    case 'song':
      return <Cover coverArt={item.song.coverArt} size={size} />;
    case 'liked':
      return <LikedCover size={size} />;
    case 'mix':
      return (
        <span className="cover cover-mosaic">
          {[0, 1, 2, 3].map((i) => (
            <Cover key={i} coverArt={item.covers[i % Math.max(1, item.covers.length)]} size={size / 2} />
          ))}
        </span>
      );
  }
}

interface CardProps {
  item: CardItem;
  /** Songs of the shelf, so a song card plays the whole row from that song. */
  list?: Song[];
}

export function Card({ item, list }: CardProps) {
  const play = usePlayItem();
  const d = describe(item);
  const round = item.type === 'artist';
  const body = (
    <>
      <span className="card-art">
        <Artwork item={item} size={180} />
        {item.type === 'mix' && (
          <span className="badge badge-magic">
            <SparkleIcon size={11} /> {t.magic}
          </span>
        )}
      </span>
      <span className="card-text">
        <span className="card-title">{d.title}</span>
        <span className="card-sub">{d.subtitle}</span>
      </span>
    </>
  );

  return (
    <div className={`card${round ? ' card-round' : ''}`}>
      {d.to ? (
        <Link to={d.to} className="card-link">{body}</Link>
      ) : (
        <button type="button" className="card-link" onClick={() => void play(item, list)}>{body}</button>
      )}
      <button type="button" className="card-play" onClick={() => void play(item, list)} aria-label={t.play(d.title)}>
        <PlayIcon size={18} color="currentColor" />
      </button>
    </div>
  );
}

/** Liked Songs tile of the mobile Home: violet tint and a white heart in a light square. */
function TileArt({ item }: { item: CardItem }) {
  if (item.type !== 'liked') return <Artwork item={item} size={64} />;
  return (
    <span className="tile-icon">
      <HeartIcon size={26} color="#fff" filled />
    </span>
  );
}

export function QuickTile({ item }: { item: CardItem }) {
  const play = usePlayItem();
  const d = describe(item);
  return (
    <div className={`tile${item.type === 'liked' ? ' tile-liked' : ''}`}>
      {d.to ? (
        <Link to={d.to} className="tile-link">
          <TileArt item={item} />
          <span className="tile-title">{d.title}</span>
        </Link>
      ) : (
        <span className="tile-link">
          <TileArt item={item} />
          <span className="tile-title">{d.title}</span>
        </span>
      )}
      <button type="button" className="tile-play" onClick={() => void play(item)} aria-label={t.play(d.title)}>
        <PlayIcon size={15} color="currentColor" />
      </button>
    </div>
  );
}
