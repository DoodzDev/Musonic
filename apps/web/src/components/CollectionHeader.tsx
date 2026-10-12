/**
 * @file CollectionHeader.tsx
 * @description Header of a playlist, album, artist or liked songs page, plus its Play button.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import { fr } from '../i18n/fr.ts';
import { PlayIcon } from './icons/PlayIcon.tsx';

interface Props {
  art: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  meta: ReactNode;
  onPlay?: () => void;
  canPlay?: boolean;
}

export function CollectionHeader({ art, eyebrow, title, description, meta, onPlay, canPlay = true }: Props) {
  return (
    <>
      <header className="collection-header">
        {art}
        <div className="collection-meta">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {description && <p className="collection-description">{description}</p>}
          <span className="collection-stats">{meta}</span>
        </div>
      </header>
      {onPlay && (
        <div className="actions">
          <button type="button" className="btn-primary btn-play" onClick={onPlay} disabled={!canPlay}>
            <PlayIcon size={16} color="currentColor" /> {fr.page.play}
          </button>
        </div>
      )}
    </>
  );
}

export function PageStatus({ status }: { status: 'loading' | 'error' }) {
  return <p className="page muted">{status === 'loading' ? fr.page.loading : fr.page.error}</p>;
}
