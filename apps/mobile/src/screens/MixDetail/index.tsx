/**
 * @file index.tsx
 * @description Magic Mix screen (Design v2, R5.11): a Home mix opened like a
 *   real playlist. Mosaic cover with the "Magic" pill, the mood as title,
 *   Shuffle and Play, then the tracks (shared `TrackRow`: like, add to a
 *   playlist, download; tap = play from that track). Opened from the Home
 *   with its songs; opened from "Recently played" (genre only), it draws a
 *   fresh mix of that genre.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import {homeSource} from '../../services/home/homeSource';
import {playFromList} from '../../services/playback/launchers';
import {songToTrack, type SongLike} from '../../utils/songToTrack';
import {usePlayerStore} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import PressableScale from '../../components/ui/PressableScale';
import Raised from '../../components/ui/Raised';
import CoverArt from '../../components/CoverArt';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {BackArrowIcon, PlayIcon, ShuffleIcon, SparkleIcon} from '../../components/icons';
import {colors, radii} from '../../theme';
import {useT} from '../../i18n';
import {useDockInset} from '../../navigation/dockLayout';
import type {SubsonicSong} from '../../api/types';

export type MixDetailParams = {genre: string; songs?: SongLike[]; covers?: string[]};

const COVER = 220;
const MIX_SIZE = 30;

export default function MixDetailScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const {params} = useRoute<RouteProp<{MixDetail: MixDetailParams}, 'MixDetail'>>();
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const [songs, setSongs] = useState<SongLike[]>(params.songs ?? []);
  const [loading, setLoading] = useState(!params.songs);
  const [addTo, setAddTo] = useState<SongLike | null>(null);

  useEffect(() => {
    if (params.songs) return;
    homeSource.getRandomSongs({genre: params.genre, size: MIX_SIZE})
      .then(setSongs)
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [params.genre, params.songs]);

  const covers = useMemo(() => {
    if (params.covers?.length) return params.covers;
    return [...new Set(songs.map(s => s.coverArt).filter((c): c is string => !!c))].slice(0, 4);
  }, [params.covers, songs]);
  const tracks = useMemo(() => songs.map(songToTrack), [songs]);
  const source = {type: 'mix' as const, id: params.genre, name: params.genre};

  const active = useActiveTrack();
  const {state} = usePlaybackState();
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const downloads = useDownloadStore(s => s.downloads);
  const active_downloads = useDownloadStore(s => s.activeDownloads);

  const playAll = useCallback(() => { playFromList(source, tracks); }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = useCallback(({item, index}: {item: SongLike; index: number}) => {
    const id = String(item.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = active_downloads[id];
    return (
      <TrackRow
        title={item.title}
        subtitle={item.artist}
        coverId={item.coverArt}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playFromList(source, tracks, index)}
        onToggleLike={() => toggleLike(id, item.title, item.artist)}
        onAddToPlaylist={() => setAddTo(item)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item as SubsonicSong)}
      />
    );
  }, [active?.id, state, overrides, likedSongIds, downloads, active_downloads, tracks, toggleLike]); // eslint-disable-line react-hooks/exhaustive-deps

  const half = COVER / 2;
  const header = (
    <View style={styles.header}>
      <Raised radius={radii.card} fill style={styles.cover}>
        <View style={styles.mosaic}>
          {covers.length >= 4
            ? covers.slice(0, 4).map(id => <CoverArt key={id} id={id} size={half} borderRadius={0} />)
            : <CoverArt id={covers[0]} size={COVER} borderRadius={0} />}
        </View>
        <View style={styles.magicPill}>
          <SparkleIcon size={12} color={colors.accent} />
          <Text variant="caption" style={styles.magicText}>{t.ui.badgeMagic}</Text>
        </View>
      </Raised>
      <Text variant="title1" numberOfLines={2} style={styles.title}>{params.genre}</Text>
      <Text variant="footnote" color="textSecondary">{t.home.mixSubtitle(songs.length)}</Text>
      <View style={styles.actions}>
        <PressableScale onPress={toggleShuffle} accessibilityLabel={t.queue.shuffleTile} style={styles.shuffleBtn}>
          <ShuffleIcon mode={shuffleMode} size={26} indicator />
        </PressableScale>
        <PressableScale onPress={playAll} haptic="light" disabled={tracks.length === 0} accessibilityLabel={t.fullScreenPlayer.play} style={styles.playBtn}>
          <PlayIcon size={26} color={colors.onAccent} />
        </PressableScale>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={songs}
        keyExtractor={(s, i) => `${s.id}-${i}`}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
        contentContainerStyle={{paddingTop: insets.top + 56, paddingBottom: dockInset + 16}}
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.back, {top: insets.top + 6}]}>
        <Button
          variant="icon"
          size={40}
          accessibilityLabel={t.common.back}
          onPress={() => navigation.goBack()}
          icon={<BackArrowIcon size={22} color={colors.textPrimary} />}
          style={styles.backBtn}
        />
      </View>
      <AddToPlaylistSheet
        visible={!!addTo}
        onClose={() => setAddTo(null)}
        trackId={addTo ? String(addTo.id) : undefined}
        trackTitle={addTo?.title}
        onToast={showToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  header: {alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, gap: 4},
  cover: {width: COVER, height: COVER, marginBottom: 16},
  mosaic: {width: COVER, height: COVER, flexDirection: 'row', flexWrap: 'wrap'},
  magicPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.32)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  magicText: {color: colors.accent},
  title: {textAlign: 'center'},
  actions: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 14},
  shuffleBtn: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  playBtn: {width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center'},
  loading: {marginTop: 32},
  back: {position: 'absolute', left: 12},
  backBtn: {backgroundColor: 'rgba(0,0,0,0.35)'},
});
