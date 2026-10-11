/**
 * @file index.tsx
 * @description "My Music" screen — browses and plays the user's entire native
 *   Navidrome library (shuffle or in order), excluding ext- (Deezer) tracks.
 *   Full library is fetched once via paginated empty-query search3 calls (no
 *   single Subsonic "get everything" endpoint exists), then filtered client-side
 *   by the search bar.
 * @author DoodzProg
 * @version 1.1.0
 * @license MIT
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useStableCallback} from '../../hooks/useStableCallback';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {darkTheme} from '../../theme';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import SearchIcon from '../../components/icons/SearchIcon';
import ShuffleIcon from '../../components/icons/ShuffleIcon';
import CoverArt from '../../components/CoverArt';
import HeartIcon from '../../components/icons/HeartIcon';
import PlusCircleIconComponent from '../../components/icons/PlusCircleIcon';
import CheckCircleGreenIcon from '../../components/icons/CheckCircleGreenIcon';
import DownloadStatusIcon from '../../components/icons/DownloadStatusIcon';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {subsonicGet, getStreamUrl, getCoverArtUrl} from '../../api/client';
import {loadAndPlayTracks, fisherYates} from '../../services/playerActions';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import type {SubsonicSong} from '../../api/types';
import type {Track} from '../../store/playerStore';
import {useT} from '../../i18n';
import {useDockInset} from '../../navigation/dockLayout';

const FULL_LIBRARY_PAGE_SIZE = 500;
const FULL_LIBRARY_MAX_PAGES = 10;

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

function isNative(id: unknown): boolean {
  return !String(id).startsWith('ext-');
}

/**
 * Enumerates every native track on the server via paginated empty-query
 * search3 calls — there is no single Subsonic "get everything" endpoint.
 */
async function fetchAllNativeSongs(): Promise<SubsonicSong[]> {
  const all: SubsonicSong[] = [];
  for (let page = 0; page < FULL_LIBRARY_MAX_PAGES; page++) {
    const res = await subsonicGet<any>('search3.view', {
      query: '',
      songCount: FULL_LIBRARY_PAGE_SIZE,
      songOffset: page * FULL_LIBRARY_PAGE_SIZE,
      albumCount: 0,
      artistCount: 0,
    });
    const batch: SubsonicSong[] = res.searchResult3?.song ?? [];
    all.push(...batch.filter(s => isNative(s.id)));
    if (batch.length < FULL_LIBRARY_PAGE_SIZE) break;
  }
  return all;
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

export default function AllSongsScreen() {
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const t = useT();
  const navigation = useNavigation<any>();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SubsonicSong | null>(null);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllNativeSongs()
      .then(result => { if (!cancelled) setSongs(result); })
      .catch(() => { if (!cancelled) setSongs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const searchedSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q),
    );
  }, [songs, searchQuery]);

  const handlePressResult = useCallback((index: number) => {
    loadAndPlayTracks(searchedSongs.map(songToTrack), index);
  }, [searchedSongs]);

  const onRowPress = useStableCallback(handlePressResult);
  const onRowAddToPlaylist = useStableCallback((song: SubsonicSong) => {
    setAddToPlaylistSong(song);
    setAddToPlaylistVisible(true);
  });

  const handlePlayAll = useCallback(() => {
    if (searchedSongs.length === 0) return;
    const tracks = searchedSongs.map(songToTrack);
    const ordered = isShuffled ? fisherYates(tracks) : tracks;
    loadAndPlayTracks(ordered, 0);
  }, [searchedSongs, isShuffled]);

  return (
    <SafeAreaView style={[styles.root, landscapePadding]} edges={isFullscreenMode ? [] : ['top']}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackArrowIcon />
        </TouchableOpacity>
        <View style={styles.searchPill}>
          <SearchIcon size={16} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder={t.allSongs.searchPlaceholder}
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{t.allSongs.title}</Text>
        <Text style={styles.subtitle}>
          {loading ? '…' : t.allSongs.trackCount(songs.length)}
        </Text>
      </View>

      {!loading && searchedSongs.length > 0 && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.shuffleBtn} onPress={toggleShuffle} activeOpacity={0.8}>
            <ShuffleIcon mode={shuffleMode} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlayAll} activeOpacity={0.85}>
            <PlayIcon />
          </TouchableOpacity>
        </View>
      )}

      <FlashList
        data={searchedSongs}
        keyExtractor={s => s.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.center}>
            {loading ? (
              <>
                <ActivityIndicator size="large" color={darkTheme.accent} />
                <Text style={styles.hintText}>{t.allSongs.loadingLibrary}</Text>
              </>
            ) : (
              <Text style={styles.hintText}>{t.allSongs.searchEmpty}</Text>
            )}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  backBtn: {
    padding: 6,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#b3b3b3',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 16,
  },
  shuffleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: darkTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: darkTheme.accent,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 8,
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
    paddingTop: 40,
    gap: 12,
  },
  hintText: {
    color: '#666',
    fontSize: 14,
  },
});
