/**
 * @file BrowsePage.tsx
 * @description Albums of a "Browse" tile of the search page: recently added,
 *   most played, random, or one decade (e.g. /browse/decade-1990).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem } from '@musonic/core';
import { useParams } from 'react-router';
import { PageStatus } from '../components/CollectionHeader.tsx';
import { Card } from '../components/Card.tsx';
import { describe } from '../components/cardModel.ts';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { browseKind } from '../lib/browse.ts';
import { tr } from '../i18n/index.ts';

export function BrowsePage() {
  const { kind = '' } = useParams();
  const { client } = useApp();
  const spec = browseKind(kind);
  const albums = useCachedQuery(spec ? `browse:${kind}` : null, spec?.ttl ?? TTL_SHORT, () => spec!.load(client));
  if (!spec) return <PageStatus status="error" />;
  if (albums.status !== 'ready') return <PageStatus status={albums.status} />;
  const items: CardItem[] = albums.data.map((album) => ({ type: 'album', album }));

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{tr.search.browse}</span>
          <h1 className="page-title">{spec.title}</h1>
          <span className="collection-stats">{tr.page.albums(items.length)}</span>
        </div>
      </div>
      {items.length > 0 ? (
        <div className="shelf-grid">
          {items.map((item) => <Card key={describe(item).key} item={item} />)}
        </div>
      ) : (
        <p className="muted">{tr.browse.empty}</p>
      )}
    </div>
  );
}
