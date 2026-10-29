/**
 * @file PodcastResults.tsx
 * @description The Podcasts scope of the search (ADR-023): shows from the
 *   directories (iTunes, Podcast Index), then the episodes where the person
 *   searched speaks. A show opens its page; an episode opens its show,
 *   scrolled to it, and plays.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import CollectionRow from '../../components/ui/CollectionRow';
import SectionHeader from '../../components/ui/SectionHeader';
import EmptyState from '../../components/ui/EmptyState';
import Text from '../../components/ui/Text';
import PressableScale from '../../components/ui/PressableScale';
import {SkeletonList} from '../../components/ui/Skeleton';
import {searchPodcasts, type PodcastFound, type PodcastFoundEpisode} from '../../api/endpoints/podcasts';
import {spacing} from '../../theme';
import {useT} from '../../i18n';
import type {SearchStackParams} from '../../navigation/types';

type Row = {kind: 'title'; title: string} | {kind: 'show'; show: PodcastFound} | {kind: 'episode'; episode: PodcastFoundEpisode};

export default function PodcastResults({query, bottomInset}: {query: string; bottomInset: number}) {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParams>>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const gen = useRef(0);

  useEffect(() => {
    const mine = ++gen.current;
    setRows(null);
    setFailed(false);
    const debounce = setTimeout(() => {
      searchPodcasts(query.trim())
        .then(({shows, episodes}) => {
          if (gen.current !== mine) return;
          setRows([
            ...(shows.length ? [{kind: 'title' as const, title: t.podcasts.shows}] : []),
            ...shows.map(show => ({kind: 'show' as const, show})),
            ...(episodes.length ? [{kind: 'title' as const, title: t.podcasts.foundEpisodes}] : []),
            ...episodes.map(episode => ({kind: 'episode' as const, episode})),
          ]);
        })
        .catch(() => gen.current === mine && setFailed(true));
    }, 400);
    return () => clearTimeout(debounce);
  }, [query, t]);

  if (failed) return <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} />;
  if (!rows) return <SkeletonList />;
  if (!rows.length) return <EmptyState title={t.search.noResults(query.trim())} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r, i) => (r.kind === 'show' ? r.show.id : r.kind === 'episode' ? `${r.episode.feedUrl}|${i}` : `t${i}`)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{paddingBottom: bottomInset + spacing.m}}
      renderItem={({item}) => {
        if (item.kind === 'title') return <View style={styles.title}><SectionHeader title={item.title} /></View>;
        if (item.kind === 'show') {
          const s = item.show;
          return (
            <CollectionRow
              kind="album"
              name={s.title}
              subtitle={s.author}
              coverUrl={s.imageUrl}
              onPress={() => navigation.push('PodcastDetail', {showId: s.id, feedUrl: s.feedUrl})}
            />
          );
        }
        const e = item.episode;
        return (
          <PressableScale
            style={styles.episode}
            onPress={() => navigation.push('PodcastDetail', {showId: e.showId, feedUrl: e.feedUrl, episodeId: e.id})}
            accessibilityLabel={e.title}>
            <Text variant="body" numberOfLines={2}>{e.title}</Text>
            <Text variant="footnote" color="textSecondary" numberOfLines={1}>{e.showTitle}</Text>
          </PressableScale>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  title: {paddingHorizontal: spacing.gutter, paddingTop: spacing.m},
  episode: {paddingHorizontal: spacing.gutter, paddingVertical: 10, gap: 2},
});
