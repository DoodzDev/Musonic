/**
 * @file index.tsx
 * @description Recommendations screen (Design v2, R5.7), reached from Liked
 *   Songs. "Based on your liked songs", "For you" and a line naming the seed
 *   artists; Play all and New suggestions; then up to 50 tracks (shared
 *   `TrackRow`, "Online" badge on online tracks). The pool mixes the top
 *   tracks of three liked artists picked at random (online) and the server's
 *   similar songs of liked tracks, without what is already liked. Each refresh
 *   draws new seeds. Playback goes through the playback engine (playFromList).
 * @author DoodzProg
 * @version 2.1.2
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {PlayShuffleRow, SquareButton} from '../../components/detail/DetailParts';
import {usePlayButton} from '../../hooks/usePlayButton';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import EmptyState from '../../components/ui/EmptyState';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import {showToast} from '../../components/Toast';
import {RefreshIcon, SparkleIcon} from '../../components/icons';
import {getStarred, getSimilarSongs} from '../../api/endpoints/library';
import {getDeezerArtistId, getDeezerArtistTopTracks} from '../../api/deezer';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {shuffle} from '../../services/playback/buildQueue';
import {usePlayerStore} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import {songToTrack} from '../../utils/songToTrack';
import {colors, spacing} from '../../theme';
import {useT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';

const MAX_RECOMMENDATIONS = 50;
const MAX_SEED_ARTISTS = 3;
const MAX_SEED_TRACKS = 5;
/** Muted accent behind the top of the page. */
const TINT = '#5A2A16';

type Recommendations = {songs: SubsonicSong[]; seeds: string[]};

async function buildRecommendations(liked: SubsonicSong[]): Promise<Recommendations> {
  const seen = new Set(liked.map(s => String(s.id)));
  const pool: SubsonicSong[] = [];
  // The server joins several artists with " • ": seed with each of them on its own.
  const names = liked.flatMap(s => (s.artist ?? '').split('•').map(a => a.trim())).filter(Boolean);
  const artists = shuffle([...new Set(names)], Math.random).slice(0, MAX_SEED_ARTISTS);
  const seedTracks = shuffle(liked.filter(s => !String(s.id).startsWith('ext-')), Math.random)
    .slice(0, MAX_SEED_TRACKS)
    .map(s => String(s.id));

  await Promise.allSettled([
    ...artists.map(async name => {
      const id = await getDeezerArtistId(name).catch(() => null);
      if (!id) return;
      for (const t of await getDeezerArtistTopTracks(id, 10).catch(() => [])) {
        const sid = `ext-deezer-song-${t.id}`;
        if (seen.has(sid)) continue;
        seen.add(sid);
        pool.push({id: sid, title: t.title, artist: t.artist.name, album: t.album.title, duration: t.duration, coverArt: sid});
      }
    }),
    ...seedTracks.map(async id => {
      for (const s of await getSimilarSongs(id, 10).catch(() => [])) {
        if (seen.has(String(s.id))) continue;
        seen.add(String(s.id));
        pool.push(s);
      }
    }),
  ]);
  return {songs: shuffle(pool, Math.random).slice(0, MAX_RECOMMENDATIONS), seeds: artists};
}

export default function LikedRecommendationsScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);
  const active = useActiveTrack();
  const {state} = usePlaybackState();

  const [recos, setRecos] = useState<Recommendations>({songs: [], seeds: []});
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = () => setRound(r => r + 1);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);
  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getStarred()
      .then(d => buildRecommendations(d.songs))
      .then(r => { if (!cancelled) setRecos(r); })
      .catch(() => { if (!cancelled) { setRecos({songs: [], seeds: []}); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [round]);

  const tracks = useMemo(() => recos.songs.map(songToTrack), [recos.songs]);
  const playAll = useCallback(() => { if (tracks.length) playFromList({type: 'recommendations'}, tracks); }, [tracks]);
  const playButton = usePlayButton({type: 'recommendations'}, playAll);

  const renderItem = useCallback(({item, index}: {item: SubsonicSong; index: number}) => {
    const id = String(item.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.title}
        subtitle={item.artist}
        coverId={item.coverArt}
        badges={id.startsWith('ext-') ? ['online'] : undefined}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playFromList({type: 'recommendations'}, tracks, index)}
        onLongPress={() => setMenuSong(item)}
        onToggleLike={() => toggleLike(id, item.title, item.artist)}
        onAddToPlaylist={() => setAddTo(item)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item)}
        onAddToQueue={() => addSongToQueue(item)}
      />
    );
  }, [active?.id, state, overrides, likedSongIds, downloads, activeDownloads, tracks, toggleLike]);

  const playRow = (
    <PlayShuffleRow
      onPlay={playButton.onPlay}
      playing={playButton.playing}
      playLabel={t.likedRecommendations.playAll}
      disabled={!tracks.length || loading}
      extra={<SquareButton icon={<RefreshIcon size={18} color={colors.textPrimary} />} onPress={() => setRound(r => r + 1)} accessibilityLabel={t.likedRecommendations.refresh} />}
    />
  );

  const heading = (
    <View style={styles.heading}>
      <View style={styles.eyebrow}>
        <SparkleIcon size={13} color={colors.accent} />
        <Text variant="footnote" style={styles.eyebrowText}>{t.likedRecommendations.eyebrow.toUpperCase()}</Text>
      </View>
      <Text variant="largeTitle" accessibilityRole="header">{t.likedRecommendations.heading}</Text>
      <Text variant="subhead" color="textSecondary" style={styles.intro}>
        {loading ? t.likedRecommendations.loading : recos.seeds.length ? t.likedRecommendations.intro(recos.songs.length, recos.seeds) : ''}
      </Text>
    </View>
  );

  const hero = (
    <View>
      {heading}
      <View style={styles.playSpacing}>{playRow}</View>
    </View>
  );

  const side = (
    <View>
      <View style={styles.sideHeading}>{heading}</View>
      <View style={styles.sidePlay}>{playRow}</View>
    </View>
  );

  return (
    <>
      <DetailScaffold
        title={t.likedRecommendations.heading}
        tint={TINT}
        hero={hero}
        side={side}
        showTitleAt={70}
        data={loading ? [] : recos.songs}
        renderItem={renderItem}
        keyExtractor={s => String(s.id)}
        loading={loading}
        empty={failed ? <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} action={{label: t.common.retry, onPress: retry}} /> : <EmptyState title={t.likedRecommendations.emptyState} />}
      />
      <AddToPlaylistSheet
        visible={!!addTo}
        onClose={() => setAddTo(null)}
        trackId={addTo ? String(addTo.id) : undefined}
        trackTitle={addTo?.title}
        onToast={showToast}
      />
      <SongOptionsSheet
        visible={!!menuSong}
        onClose={() => setMenuSong(null)}
        track={menuSong}
        onToast={showToast}
        onNavigateAlbum={albumId => navigation.navigate('AlbumDetail', {albumId})}
        onNavigateArtist={(artistId, artistName) => navigation.navigate('ArtistDetail', {artistId, artistName})}
      />
    </>
  );
}

const styles = StyleSheet.create({
  heading: {paddingHorizontal: spacing.gutter, paddingTop: spacing.s, gap: 4},
  eyebrow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  eyebrowText: {color: colors.accent, fontWeight: '600', letterSpacing: 0.4},
  intro: {marginTop: 2},
  playSpacing: {paddingTop: 16, paddingBottom: 12},
  sideHeading: {marginHorizontal: -spacing.gutter},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
});
