/**
 * @file index.tsx
 * @description Liked Songs screen. Text-only header (no cover) with a top search
 *   bar, like/add-to-playlist/download actions per row, and remove-from-liked
 *   actions.
 *   Playback goes through the playback engine (playFromList).
 * @author DoodzProg
 * @version 1.2.0
 * @license MIT
 */

import React, {useState, useCallback, useMemo} from 'react';
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
  Alert,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {darkTheme} from '../../theme';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import SearchIcon from '../../components/icons/SearchIcon';
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon';
import {getStarred} from '../../api/endpoints/library';
import {getStreamUrl, getCoverArtUrl} from '../../api/client';
import {playFromList} from '../../services/playback/launchers';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import type {SubsonicSong} from '../../api/types';
import type {Track} from '../../store/playerStore';
import CoverArt from '../../components/CoverArt';
import HeartIcon from '../../components/icons/HeartIcon';
import ShuffleIcon from '../../components/icons/ShuffleIcon';
import PlusCircleIconComponent from '../../components/icons/PlusCircleIcon';
import CheckCircleGreenIcon from '../../components/icons/CheckCircleGreenIcon';
import DownloadStatusIcon from '../../components/icons/DownloadStatusIcon';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {useT, getT} from '../../i18n';
import {useDockInset} from '../../navigation/dockLayout';

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

// ─── Song Row ────────────────────────────────────────────────────────────────

type SongRowProps = {
  song: SubsonicSong;
  index: number;
  onPress: (index: number) => void;
  onMore: (song: SubsonicSong) => void;
  onAddToPlaylist: (song: SubsonicSong) => void;
};

const SongRow = React.memo(function SongRow({song, index, onPress, onMore, onAddToPlaylist}: SongRowProps) {
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const pendingLikes = usePlayerStore(s => s.pendingLikes);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const savedSet = usePlaylistCacheStore(s => s.savedSet);
  const id = String(song.id);
  const isLiked = localLikeOverrides[id] !== undefined ? localLikeOverrides[id] : likedSongIds.has(id);
  const isInPlaylist = savedSet.has(id);

  const handleDownloadPress = useCallback(() => {
    const isDownloaded = id in useDownloadStore.getState().downloads;
    if (isDownloaded) {
      const d = getT();
      Alert.alert(
        d.downloads.deleteSongTitle,
        d.downloads.deleteSongMessage(song.title),
        [
          {text: d.downloads.cancelButton, style: 'cancel'},
          {
            text: d.downloads.deleteConfirm,
            style: 'destructive',
            onPress: () => useDownloadStore.getState().deleteDownload(id),
          },
        ],
      );
    } else {
      useDownloadStore.getState().enqueueTrack(song);
    }
  }, [id, song]);

  return (
    <TouchableOpacity style={styles.songRow} onPress={() => onPress(index)} onLongPress={() => onMore(song)} delayLongPress={400} activeOpacity={0.7}>
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
          hitSlop={{top: 10, bottom: 10, left: 6, right: 6}}
          onPress={handleDownloadPress}>
          <DownloadStatusIcon trackId={id} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreBtn}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          onPress={() => onMore(song)}>
          <DotsVerticalIcon size={20} color="#b3b3b3" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
// Callbacks are stable (useStableCallback) and receive the row's index/song,
// so comparing data and position is enough and no stale closure can run.
}, (prev, next) =>
  prev.song.id === next.song.id && prev.song.title === next.song.title && prev.index === next.index);

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LikedSongsScreen() {
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const t = useT();
  const navigation = useNavigation<any>();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSong, setSelectedSong] = useState<SubsonicSong | null>(null);
  const [songOptsVisible, setSongOptsVisible] = useState(false);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<SubsonicSong | null>(null);
  const [addToPlaylistVisible, setAddToPlaylistVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  useFocusEffect(useCallback(() => {
    setLoading(true);
    getStarred()
      .then(d => {
        setSongs(d.songs);
        setLikedSongs(d.songs.map(s => String(s.id)));
      })
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [setLikedSongs]));

  const displayedSongs = songs.filter(s => localLikeOverrides[String(s.id)] !== false);

  const searchedSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return displayedSongs;
    return displayedSongs.filter(
      s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q),
    );
  }, [displayedSongs, searchQuery]);

  const handlePlayAll = useCallback(() => {
    if (searchedSongs.length === 0) return;
    playFromList({type: 'liked'}, searchedSongs.map(songToTrack));
  }, [searchedSongs]);

  const handlePressSong = useCallback(
    (index: number) => {
      playFromList({type: 'liked'}, searchedSongs.map(songToTrack), index);
    },
    [searchedSongs],
  );

  const handleMore = useCallback((song: SubsonicSong) => {
    setSelectedSong(song);
    setSongOptsVisible(true);
  }, []);

  const onRowPress = useStableCallback(handlePressSong);
  const onRowMore = useStableCallback(handleMore);
  const onRowAddToPlaylist = useStableCallback((song: SubsonicSong) => {
    setAddToPlaylistSong(song);
    setAddToPlaylistVisible(true);
  });

  const handleNavigateAlbum = useCallback((albumId: string) => {
    navigation.navigate('AlbumDetail', {albumId});
  }, [navigation]);

  const handleNavigateArtist = useCallback((artistId: string | undefined, artistName: string) => {
    navigation.navigate('ArtistDetail', {artistId, artistName});
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.root, landscapePadding]} edges={isFullscreenMode ? [] : ['top']}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />

      {/* Fixed row — back button + search never scroll away, unlike the
          gradient/title block below which is part of the FlashList header. */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackArrowIcon />
        </TouchableOpacity>
        <View style={styles.searchPill}>
          <SearchIcon size={16} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder={t.likedSongs.searchPlaceholder}
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlashList
        data={searchedSongs}
        keyExtractor={s => s.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={['#3d1870', '#1a1040', darkTheme.background]}
              style={styles.headerGrad}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{t.likedSongs.title}</Text>
                <Text style={styles.subtitle}>
                  {loading ? '…' : t.likedSongs.trackCount(displayedSongs.length)}
                </Text>
              </View>
            </LinearGradient>

            {!loading && displayedSongs.length > 0 && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.recoButton}
                  onPress={() => navigation.navigate('LikedRecommendations')}
                  activeOpacity={0.8}>
                  <Text style={styles.recoButtonText}>{t.likedSongs.recommendedButton}</Text>
                </TouchableOpacity>
                <View style={styles.actionRowRight}>
                  <TouchableOpacity
                    style={styles.shuffleBtn}
                    onPress={toggleShuffle}
                    activeOpacity={0.8}>
                    <ShuffleIcon mode={shuffleMode} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.playBtn}
                    onPress={handlePlayAll}
                    activeOpacity={0.85}>
                    <PlayIcon />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={darkTheme.accent} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyText}>{t.likedSongs.emptyState}</Text>
            </View>
          )
        }
        renderItem={({item, index}) => (
          <SongRow
            song={item}
            index={index}
            onPress={onRowPress}
            onMore={onRowMore}
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

      <SongOptionsSheet
        visible={songOptsVisible}
        onClose={() => setSongOptsVisible(false)}
        track={selectedSong}
        onToast={showToast}
        onNavigateAlbum={handleNavigateAlbum}
        onNavigateArtist={handleNavigateArtist}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: darkTheme.background},
  headerGrad: {
    paddingBottom: 4,
  },
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
    paddingBottom: 16,
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 16,
  },
  actionRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  recoButton: {
    flexShrink: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#282828',
    alignItems: 'center',
  },
  recoButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  moreBtn: {
    paddingVertical: 8,
    paddingLeft: 4,
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
  },
  emptyText: {
    color: '#b3b3b3',
    fontSize: 15,
    fontWeight: '500',
  },
});
