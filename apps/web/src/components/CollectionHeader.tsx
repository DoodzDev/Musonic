/**
 * @file CollectionHeader.tsx
 * @description Header of a playlist, album, artist or liked songs page, plus its Play button.
 *   In a playlist's edit mode the title and description become fields in place.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import { tr } from '../i18n/index.ts';
import { PlayIcon } from './icons/PlayIcon.tsx';

interface Props {
  art: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
  meta: ReactNode;
  onPlay?: () => void;
  canPlay?: boolean;
  /** Extra buttons after Play (rename, delete…). */
  extra?: ReactNode;
  /** Edit mode: the title and description are edited in place. */
  edit?: {
    title: string;
    description: string;
    onTitle: (value: string) => void;
    onDescription: (value: string) => void;
    titleLabel: string;
    descriptionPlaceholder: string;
  };
}

export function CollectionHeader({ art, eyebrow, title, description, meta, onPlay, canPlay = true, extra, edit }: Props) {
  return (
    <>
      <header className="collection-header">
        {art}
        <div className="collection-meta">
          <span className="eyebrow">{eyebrow}</span>
          {edit ? (
            <>
              <input
                className="collection-title-input"
                value={edit.title}
                onChange={(e) => edit.onTitle(e.target.value)}
                aria-label={edit.titleLabel}
                autoFocus
              />
              <textarea
                className="collection-description-input"
                value={edit.description}
                onChange={(e) => edit.onDescription(e.target.value)}
                placeholder={edit.descriptionPlaceholder}
                aria-label={edit.descriptionPlaceholder}
                rows={2}
              />
            </>
          ) : (
            <>
              <h1>{title}</h1>
              {description && <p className="collection-description">{description}</p>}
            </>
          )}
          <span className="collection-stats">{meta}</span>
        </div>
      </header>
      {(onPlay || extra) && (
        <div className="actions">
          {onPlay && (
            <button type="button" className="btn-primary btn-play" onClick={onPlay} disabled={!canPlay}>
              <PlayIcon size={16} color="currentColor" /> {tr.page.play}
            </button>
          )}
          {extra}
        </div>
      )}
    </>
  );
}

export function PageStatus({ status }: { status: 'loading' | 'error' }) {
  return <p className="page muted">{status === 'loading' ? tr.page.loading : tr.page.error}</p>;
}
