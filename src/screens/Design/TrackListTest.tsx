/**
 * @file TrackListTest.tsx
 * @description Debug-only scroll test for TrackRow: 500 rows built from the
 *   songs already cached on the device, in a FlashList, with live like and
 *   now-playing states. Used to check the list stays at 60 fps.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {FlashList} from '@shopify/flash-list';
import TrackRow, {type DownloadState} from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {colors, spacing} from '../../theme';
import type {SubsonicSong} from '../../api/types';
import type {BadgeKind} from '../../components/ui/Badge';

const ROW_COUNT = 500;

type Item = {key: string; song: SubsonicSong};

type DemoRowProps = {
  item: Item;
  liked: boolean;
  current: boolean;
  download: DownloadState;
  onToggleLike: (key: string) => void;
  onPlay: (key: string) => void;
};

const MAGIC: BadgeKind[] = ['magic'];
const ONLINE: BadgeKind[] = ['online'];

/** Builds the row's callbacks from stable parent handlers so memo holds. */
const DemoRow = React.memo(function DemoRow({item, liked, current, download, onToggleLike, onPlay}: DemoRowProps) {
  const n = Number(item.key.split(':')[1]);
  return (
    <TrackRow
      title={item.song.title}
      subtitle={item.song.artist}
      coverId={item.song.coverArt}
      badges={n % 7 === 0 ? MAGIC : n % 11 === 0 ? ONLINE : undefined}
      liked={liked}
      download={download}
      playback={current ? 'playing' : 'idle'}
      onPress={() => onPlay(item.key)}
      onToggleLike={() => onToggleLike(item.key)}
    />
  );
});

export default function TrackListTest() {
  const navigation = useNavigation();
  const cached = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const downloads = useDownloadStore(s => s.downloads);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState<string | null>(null);

  const items = useMemo<Item[]>(() => {
    const songs = Object.values(cached).flat();
    if (songs.length === 0) return [];
    return Array.from({length: ROW_COUNT}, (_, i) => ({
      key: `${songs[i % songs.length].id}:${i}`,
      song: songs[i % songs.length],
    }));
  }, [cached]);

  const onToggleLike = useCallback((key: string) => {
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onPlay = useCallback((key: string) => setCurrent(key), []);

  const renderItem = useCallback(
    ({item}: {item: Item}) => (
      <DemoRow
        item={item}
        liked={liked.has(item.key)}
        current={current === item.key}
        download={item.song.id in downloads ? 'done' : 'none'}
        onToggleLike={onToggleLike}
        onPlay={onPlay}
      />
    ),
    [liked, current, downloads, onToggleLike, onPlay],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Button
          variant="icon"
          accessibilityLabel="Retour"
          onPress={() => navigation.goBack()}
          icon={<BackArrowIcon size={22} color={colors.textPrimary} />}
          style={styles.back}
        />
        <Text variant="headline">
          {items.length} lignes · TrackRow
        </Text>
      </View>
      {items.length === 0 ? (
        <Text variant="subhead" color="textSecondary" style={styles.empty}>
          Aucun titre en cache : ouvre une playlist dans l'app d'abord.
        </Text>
      ) : (
        <FlashList data={items} renderItem={renderItem} keyExtractor={i => i.key} extraData={current} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.s},
  back: {backgroundColor: 'transparent'},
  empty: {padding: spacing.gutter},
});
