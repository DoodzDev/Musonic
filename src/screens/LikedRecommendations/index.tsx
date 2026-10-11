/**
 * @file index.tsx
 * @description Recommended tracks screen, reached from Liked Songs. Builds a pool
 *   of up to 50 tracks from Deezer top tracks of the user's most-liked artists and
 *   Navidrome getSimilarSongs on native liked tracks, deduped against what's
 *   already liked, shuffled, and capped at 50.
 * @author DoodzProg
 * @version 1.1.0
 * @license MIT
 */

import React, {useCallback, useState} from 'react';
import {useStableCallback} from '../../hooks/useStableCallback';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {darkTheme} from '../../theme';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import CoverArt from '../../components/CoverArt';
import HeartIcon from '../../components/icons/HeartIcon';
import PlusCircleIconComponent from '../../components/icons/PlusCircleIcon';
import CheckCircleGreenIcon from '../../components/icons/CheckCircleGreenIcon';
import DownloadStatusIcon from '../../components/icons/DownloadStatusIcon';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {getStarred, getSimilarSongs} from '../../api/endpoints/library';
import {getDeezerArtistId, getDeezerArtistTopTracks} from '../../api/deezer';
import {getStreamUrl, getCoverArtUrl} from '../../api/client';
import {loadAndPlayTracks, fisherYates} from '../../services/playerActions';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import type {SubsonicSong} from '../../api/types';
import type {Track} from '../../store/playerStore';
import {useT} from '../../i18n';
import {useDockInset} from '../../navigation/dockLayout';

const MAX_RECOMMENDATIONS = 50;
const MAX_SEED_ARTISTS = 3;
const MAX_SEED_TRACKS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function songToTrack(s: SubsonicSong): Track {
  const id = String(s.id);
  return {
    id,
    title: s.title,
    artist: s.artist,
    album: s.album || '',
    duration: s.duration || 0,
    coverArt: s.coverArt,
    streamUrl: getStreamUrl(id),
    url: getStreamUrl(id),
    artwork: getCoverArtUrl(s.coverArt || id, 300),
  };
}

async function buildRecommendations(likedSongs: SubsonicSong[]): Promise<SubsonicSong[]> {
  const seenIds = new Set(likedSongs.map(s => String(s.id)));
  const pool: SubsonicSong[] = [];

  const uniqueArtists: string[] = [];
  for (const s of likedSongs) {
    if (s.artist && !uniqueArtists.includes(s.artist)) uniqueArtists.push(s.artist);
    if (uniqueArtists.length >= MAX_SEED_ARTISTS) break;
  }
  const nativeSeedIds = likedSongs
    .filter(s => !String(s.id).startsWith('ext-'))
    .slice(0, MAX_SEED_TRACKS)
    .map(s => String(s.id));

  await Promise.allSettled([
    ...uniqueArtists.map(async artistName => {
      const artistId = await getDeezerArtistId(artistName).catch(() => null);
      if (!artistId) return;
      const tracks = await getDeezerArtistTopTracks(artistId, 10).catch(() => []);
      for (const t of tracks) {
        const sid = `ext-deezer-song-${t.id}`;
        if (seenIds.has(sid)) continue;
        seenIds.add(sid);
        pool.push({
          id: sid,
          title: t.title,
          artist: t.artist.name,
          album: t.album.title,
          duration: t.duration,
          coverArt: sid,
        } as SubsonicSong);
      }
    }),
    ...nativeSeedIds.map(async id => {
      const similar = await getSimilarSongs(id, 10).catch(() => []);
      for (const s of similar) {
        const sid = String(s.id);
        if (seenIds.has(sid)) continue;
        seenIds.add(sid);
        pool.push(s);
      }
    }),
  ]);

  return fisherYates(pool).slice(0, MAX_RECOMMENDATIONS);
}

// ─── Song Row ────────────────────────────────────────────────────────────────

type SongRowProps = {
  song: SubsonicSong;
  index: number;
  onPress: (index: number) => void;
  onAddToPlaylist: (song: SubsonicSong) => void;
};

const SongRow = React.memo(function SongRow({song, index, onPress, onAddToPlaylist}: SongRowProps) {
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const id = String(song.id);
  const isLiked = localLikeOverrides[id] !== undefined ? localLikeOverrides[id] : likedSongIds.has(id);
  const isInPlaylist = savedSet.has(id);

  return (
    <TouchableOpacity style={styles.songRow} onPress={() => onPress(index)} activeOpacity={0.7}>
      <CoverArt id={song.coverArt} size={48} borderRadius={4} />
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
      </View>
      <View style={styles.songActions}>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 10, right: 6}}
          onPress={() => toggleLike(id, song.title, song.artist)}
          disabled={pendingLikes.has(id)}>
          {pendingLikes.has(id)
            ? <ActivityIndicator size="small" color={darkTheme.accent} style={styles.likeSpinner} />
            : <HeartIcon size={20} color={isLiked ? darkTheme.accent : '#444'} filled={isLiked} />}
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
          onPress={() => onAddToPlaylist(song)}>
          {isInPlaylist
            ? <CheckCircleGreenIcon size={20} />
            : <PlusCircleIconComponent size={20} color="#444" />}
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={{top: 10, bottom: 10, left: 6, right: 10}}
          onPress={() => useDownloadStore.getState().enqueueTrack(song)}>
          <DownloadStatusIcon trackId={id} size={20} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
// Callbacks are stable (useStableCallback) and receive the row's index/song,
// so comparing data and position is enough and no stale closure can run.
}, (prev, next) =>
  prev.song.id === next.song.id && prev.song.title === next.song.title && prev.index === next.index);

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LikedRecommendationsScreen() {
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const t = useT();
  const navigation = useNavigation<any>();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SubsonicSong | null>(null);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getStarred()
      .then(async d => {
        const recos = await buildRecommendations(d.songs);
        if (!cancelled) setSongs(recos);
      })
      .catch(() => { if (!cancelled) setSongs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []));

  const displayedSongs = songs.filter(s => localLikeOverrides[String(s.id)] !== false);

  const handlePressSong = useCallback((index: number) => {
    loadAndPlayTracks(displayedSongs.map(songToTrack), index);
  }, [displayedSongs]);

  const onRowPress = useStableCallback(handlePressSong);
  const onRowAddToPlaylist = useStableCallback((song: SubsonicSong) => {
    setAddToPlaylistSong(song);
    setAddToPlaylistVisible(true);
  });

  return (
    <SafeAreaView style={[styles.root, landscapePadding]} edges={isFullscreenMode ? [] : ['top']}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackArrowIcon />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t.likedRecommendations.title}</Text>
          <Text style={styles.subtitle}>{t.likedRecommendations.subtitle}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={darkTheme.accent} />
          <Text style={styles.loadingText}>{t.likedRecommendations.loading}</Text>
        </View>
      ) : (
        <FlashList
          data={displayedSongs}
          keyExtractor={s => s.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{t.likedRecommendations.emptyState}</Text>
            </View>
          }
          renderItem={({item, index}) => (
            <SongRow
              song={item}
              index={index}
              onPress={onRowPress}
              onAddToPlaylist={onRowAddToPlaylist}
            />
          )}
          contentContainerStyle={[styles.listContent, {paddingBottom: dockInset}]}
        />
      )}

      <AddToPlaylistSheet
        visible={addToPlaylistVisible}
        onClose={() => setAddToPlaylistVisible(false)}
        trackId={addToPlaylistSong ? String(addToPlaylistSong.id) : undefined}
        trackTitle={addToPlaylistSong?.title}
        onToast={showToast}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: darkTheme.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {padding: 6},
  headerText: {flex: 1},
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#b3b3b3',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 140,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 8,
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  songArtist: {
    color: '#b3b3b3',
    fontSize: 13,
    marginTop: 2,
  },
  songActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeSpinner: {
    width: 20,
    height: 20,
  },
  center: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    color: '#b3b3b3',
    fontSize: 14,
  },
  emptyText: {
    color: '#b3b3b3',
    fontSize: 15,
    fontWeight: '500',
  },
});
