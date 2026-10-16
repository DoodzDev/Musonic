/**
 * @file index.tsx
 * @description Magic Mix screen (Design v2, R5.11): a Home mix opened like a
 *   real playlist. Mosaic cover with the "Magic" pill, the mood as title,
 *   Shuffle and Play, then the tracks (shared `TrackRow`: like, add to a
 *   playlist, download; tap = play from that track). Opened from the Home
 *   with its songs; opened from "Recently played" (genre only), it draws a
 *   fresh mix of that genre. Built on the shared detail layout.
 *   (`DetailScaffold`), like albums and playlists.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useRoute, type RouteProp} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import {homeSource} from '../../services/home/homeSource';
import {playFromList} from '../../services/playback/launchers';
import {songToTrack, type SongLike} from '../../utils/songToTrack';
import {usePlayerStore} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import CoverArt from '../../components/CoverArt';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {SparkleIcon} from '../../components/icons';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {PlayShuffleRow} from '../../components/detail/DetailParts';
import {colors, radii} from '../../theme';
import {useT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';

export type MixDetailParams = {genre: string; songs?: SongLike[]; covers?: string[]};

const COVER = 232;
const SIDE_COVER = 128;
const MIX_SIZE = 30;

export default function MixDetailScreen() {
  const t = useT();
  const {params} = useRoute<RouteProp<{MixDetail: MixDetailParams}, 'MixDetail'>>();
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

  const mosaic = (size: number) => (
    <Raised radius={radii.card} fill style={{width: size, height: size}}>
      <View style={styles.mosaic}>
        {covers.length >= 4
          ? covers.slice(0, 4).map(id => <CoverArt key={id} id={id} size={size / 2} borderRadius={0} />)
          : <CoverArt id={covers[0]} size={size} borderRadius={0} />}
      </View>
      <View style={styles.magicPill}>
        <SparkleIcon size={12} color={colors.accent} />
        <Text variant="caption" style={styles.magicText}>{t.ui.badgeMagic}</Text>
      </View>
    </Raised>
  );
  const playRow = (
    <PlayShuffleRow onPlay={playAll} onShuffle={toggleShuffle} shuffleMode={shuffleMode} disabled={tracks.length === 0} />
  );
  const hero = (
    <View>
      <View style={styles.header}>
        {mosaic(COVER)}
        <Text variant="title2" numberOfLines={2} style={styles.title}>{params.genre}</Text>
        <Text variant="footnote" color="textSecondary">{t.home.mixSubtitle(songs.length)}</Text>
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
    </View>
  );
  const side = (
    <View>
      {mosaic(SIDE_COVER)}
      <Text variant="title3" numberOfLines={2} style={styles.sideTitle}>{params.genre}</Text>
      <Text variant="footnote" color="textSecondary">{t.home.mixSubtitle(songs.length)}</Text>
      <View style={styles.sidePlay}>{playRow}</View>
    </View>
  );

  return (
    <>
      <DetailScaffold
        title={params.genre}
        coverId={covers[0]}
        hero={hero}
        side={side}
        showTitleAt={COVER + 36}
        data={songs}
        renderItem={renderItem}
        keyExtractor={(s, i) => `${s.id}-${i}`}
        loading={loading}
      />
      <AddToPlaylistSheet
        visible={!!addTo}
        onClose={() => setAddTo(null)}
        trackId={addTo ? String(addTo.id) : undefined}
        trackTitle={addTo?.title}
        onToast={showToast}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, gap: 4},
  mosaic: {flex: 1, flexDirection: 'row', flexWrap: 'wrap'},
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
  title: {textAlign: 'center', marginTop: 14},
  playSpacing: {paddingTop: 18, paddingBottom: 12},
  sideTitle: {fontWeight: '700', marginTop: 12},
  sidePlay: {marginTop: 16, marginHorizontal: -20},
});
