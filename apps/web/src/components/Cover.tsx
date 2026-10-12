/**
 * @file Cover.tsx
 * @description Cover art loaded at the size it is displayed, with a quiet placeholder.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type ReactNode } from 'react';
import { useApp } from '../context/AppContext.tsx';

interface Props {
  coverArt?: string;
  /** Tried when `coverArt` fails, e.g. an album cover for an artist without a picture. */
  fallbackCoverArt?: string;
  /** Displayed size in CSS pixels; the image is requested at twice that for sharp screens. */
  size: number;
  round?: boolean;
  className?: string;
  /** Shown when there is no image at all. */
  placeholder?: ReactNode;
  eager?: boolean;
}

export function Cover({ coverArt, fallbackCoverArt, size, round, className, placeholder, eager }: Props) {
  const { client } = useApp();
  const [failed, setFailed] = useState<string[]>([]);
  const source = [coverArt, fallbackCoverArt].find((id) => id && !failed.includes(id));
  // Request a standard size so the server and the browser can cache it.
  const requested = size <= 64 ? 128 : size <= 160 ? 300 : 600;

  return (
    <span className={`cover${round ? ' is-round' : ''}${className ? ` ${className}` : ''}`}>
      {source ? (
        <img
          key={source}
          src={client.coverArtUrl(source, requested)}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed((f) => [...f, source])}
        />
      ) : (
        <span className="cover-placeholder" aria-hidden="true">{placeholder}</span>
      )}
    </span>
  );
}
