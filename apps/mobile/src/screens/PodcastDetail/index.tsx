/**
 * @file index.tsx
 * @description A podcast show (ADR-023): its cover, author and description,
 *   Follow, and its episodes newest first, each with its date and where the
 *   account stopped. Opened from a search with `feedUrl` (the server may not
 *   know the show yet); `episodeId` (an episode found by person) is scrolled
 *   to, shown and played once the show is loaded.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useRoute, type RouteProp} from '@react-navigation/native';
import {useActiveTrack} from '../../services/player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import Button from '../../components/ui/Button';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import CoverArt from '../../components/CoverArt';
import {showToast} from '../../components/Toast';
import {followPodcast, getPodcastShow, unfollowPodcast, type PodcastEpisode, type PodcastShow} from '../../api/endpoints/podcasts';
import {episodeSummary, playEpisode} from '../../services/podcastPlayback';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import type {LibraryStackParams} from '../../navigation/types';

const COVER = 220;
const ROW = 64;

export default function PodcastDetailScreen() {
  const t = useT();
  const {showId, feedUrl, episodeId} = useRoute<RouteProp<LibraryStackParams, 'PodcastDetail'>>().params;
  const [show, setShow] = useState<PodcastShow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useActiveTrack();
  const listRef = useRef<any>(null);
  const started = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getPodcastShow(feedUrl ? {url: feedUrl} : {id: showId})
      .then(setShow)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [feedUrl, showId]);

  useEffect(load, [load]);

  // An episode found by person: shown and played once the show is there.
  useEffect(() => {
    if (!show || !episodeId || started.current) return;
    const index = show.episode.findIndex(e => e.id === episodeId);
    if (index < 0) return;
    started.current = true;
    setTimeout(() => listRef.current?.scrollToIndex?.({index, viewPosition: 0.4, animated: true}), 300);
    playEpisode(show.episode[index], show).catch(() => {});
  }, [show, episodeId]);

  const toggleFollow = useCallback(async () => {
    if (!show || busy) return;
    setBusy(true);
    try {
      if (show.followed) await unfollowPodcast(show.id);
      else await followPodcast(show.url);
      setShow({...show, followed: !show.followed});
    } catch {
      showToast(t.podcasts.followError);
    } finally {
      setBusy(false);
    }
  }, [show, busy, t]);

  const renderItem = useCallback(({item}: {item: PodcastEpisode}) => {
    const playing = String(active?.id) === item.id;
    const wanted = item.id === episodeId;
    return (
      <PressableScale
        onPress={() => show && playEpisode(item, show).catch(() => {})}
        style={[styles.row, wanted && styles.wanted]}
        accessibilityLabel={item.title}>
        <View style={styles.rowText}>
          <Text variant="body" numberOfLines={2} style={[playing && styles.playing, item.played && !playing && styles.played]}>{item.title}</Text>
          <Text variant="footnote" color="textSecondary" numberOfLines={1}>
            {episodeSummary(item)}
          </Text>
        </View>
      </PressableScale>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, episodeId, show, t]);

  const hero = show ? (
    <View style={styles.hero}>
      <Raised radius={radii.button}>
        <CoverArt id={show.coverArt} size={COVER} borderRadius={radii.button} />
      </Raised>
      <Text variant="title2" numberOfLines={2} style={styles.title}>{show.title}</Text>
      {show.author ? <Text variant="headline" numberOfLines={1} style={styles.author}>{show.author}</Text> : null}
      <Text variant="footnote" color="textSecondary" style={styles.meta}>{t.podcasts.episodesCount(show.episode.length)}</Text>
      <View style={styles.follow}>
        <Button
          variant={show.followed ? 'tinted' : 'filled'}
          label={show.followed ? t.podcasts.following : t.podcasts.follow}
          onPress={toggleFollow}
          disabled={busy}
        />
      </View>
      {show.description ? (
        <Text variant="footnote" color="textSecondary" numberOfLines={4} style={styles.description}>
          {show.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <DetailScaffold
      title={show?.title ?? ''}
      coverId={show?.coverArt}
      hero={hero}
      showTitleAt={COVER + 40}
      data={show?.episode ?? []}
      renderItem={renderItem}
      keyExtractor={e => e.id}
      itemHeight={() => ROW}
      listRef={listRef}
      loading={loading}
      empty={failed ? <EmptyState title={t.podcasts.loadError} action={{label: t.common.retry, onPress: load}} /> : show && !show.episode.length ? <EmptyState title={t.podcasts.noEpisodes} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  hero: {alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.s, paddingBottom: spacing.m},
  title: {textAlign: 'center', marginTop: 20},
  author: {color: colors.accent, textAlign: 'center'},
  meta: {marginTop: 4},
  follow: {marginTop: 16},
  description: {marginTop: 16, textAlign: 'center'},
  row: {minHeight: ROW, justifyContent: 'center', paddingHorizontal: spacing.gutter, paddingVertical: 8},
  wanted: {backgroundColor: colors.surface1},
  rowText: {gap: 2},
  playing: {color: colors.accent},
  played: {color: colors.textSecondary},
});
