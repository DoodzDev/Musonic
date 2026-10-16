/**
 * @file index.tsx
 * @description Liked Songs screen (Design v2, R5.7). Liked cover, title,
 *   "N songs · length"; Play, Shuffle and Download all; a card to the
 *   recommendations; a search field; the songs (shared `TrackRow`: unlike,
 *   add to a playlist, download, long press = track menu). Built on the shared
 *   detail layout. Playback goes through the playback engine (playFromList).
 *   Offline (or when the server cannot be reached), lists the downloaded liked
 *   songs, from the copy of the liked list saved on the last online visit.
 * @author DoodzProg
 * @version 2.1.2
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {PlayShuffleRow, SquareButton} from '../../components/detail/DetailParts';
import {usePlayButton} from '../../hooks/usePlayButton';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import {LikedCover, LIKED_COVER_COLORS} from '../../components/ui/SpecialCovers';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {BackArrowIcon, DownloadIcon, SparkleIcon} from '../../components/icons';
import {getStarred} from '../../api/endpoints/library';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {usePlayerStore} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useDownloadStore} from '../../store/downloadStore';
import {offlineLikedSongs} from '../../utils/offlineSongs';
import {songToTrack} from '../../utils/songToTrack';
import {colors, radii, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';

const COVER = 200;
const SIDE_COVER = 128;

function lengthLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export default function LikedSongsScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);
  const active = useActiveTrack();
  const {state} = usePlaybackState();

  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Server unreachable and nothing downloaded to show instead.
  const [failed, setFailed] = useState(false);
  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);

  const load = useCallback(() => {
    // Only downloaded tracks can play offline: list the downloaded liked ones.
    const offlineList = () => offlineLikedSongs(
      usePlaylistCacheStore.getState().cachedLikedSongs,
      usePlayerStore.getState().likedSongIds,
      useDownloadStore.getState().downloads,
    );
    setFailed(false);
    if (isOfflineMode) {
      setSongs(offlineList());
      setLoading(false);
      return;
    }
    getStarred()
      .then(d => {
        setSongs(d.songs);
        setLikedSongs(d.songs.map(s => String(s.id)));
        usePlaylistCacheStore.getState().setCachedLikedSongs(d.songs);
      })
      .catch(() => {
        const list = offlineList();
        setSongs(list);
        setFailed(list.length === 0);
      })
      .finally(() => setLoading(false));
  }, [setLikedSongs, isOfflineMode]);
  useFocusEffect(load);
  const retry = () => { setLoading(true); load(); };

  // Unliked here: hidden at once, before the server list is fetched again.
  const liked = useMemo(() => songs.filter(s => overrides[String(s.id)] !== false), [songs, overrides]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return liked;
    return liked.filter(s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q));
  }, [liked, query]);
  const tracks = useMemo(() => shown.map(songToTrack), [shown]);
  const totalSeconds = useMemo(() => liked.reduce((sum, s) => sum + (s.duration || 0), 0), [liked]);

  const toDownload = useMemo(
    () => liked.filter(s => !String(s.id).startsWith('ext-') && !downloads[String(s.id)]),
    [liked, downloads],
  );
  const allDownloaded = liked.length > 0 && toDownload.length === 0;

  const downloadAll = useCallback(() => {
    const d = getT();
    if (allDownloaded) {
      showToast(d.likedSongs.allDownloaded);
      return;
    }
    Alert.alert(d.likedSongs.downloadAll, d.likedSongs.downloadAllMessage(toDownload.length), [
      {text: d.playlistOptions.cancelButton, style: 'cancel'},
      {
        text: d.songOptions.download,
        onPress: () => {
          useDownloadStore.getState().enqueueBatch(toDownload);
          showToast(d.songOptions.downloadQueued);
        },
      },
    ]);
  }, [allDownloaded, toDownload]);

  const playAll = useCallback(() => { if (tracks.length) playFromList({type: 'liked'}, tracks); }, [tracks]);
  const playButton = usePlayButton({type: 'liked'}, playAll);

  const renderItem = useCallback(({item, index}: {item: SubsonicSong; index: number}) => {
    const id = String(item.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.title}
        subtitle={item.artist}
        coverId={item.coverArt}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playFromList({type: 'liked'}, tracks, index)}
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
      onShuffle={toggleShuffle}
      shuffleMode={shuffleMode}
      disabled={!tracks.length}
      extra={isOfflineMode ? null : (
        <SquareButton
          icon={<DownloadIcon size={20} color={allDownloaded ? colors.success : colors.textPrimary} />}
          onPress={downloadAll}
          accessibilityLabel={t.likedSongs.downloadAll}
        />
      )}
    />
  );

  const meta = loading ? '…' : [t.likedSongs.trackCount(liked.length), totalSeconds > 0 ? lengthLabel(totalSeconds) : ''].filter(Boolean).join(' · ');

  const recoCard = isOfflineMode || liked.length === 0 ? null : (
    <Pressable
      onPress={() => navigation.navigate('LikedRecommendations')}
      android_ripple={{color: colors.fill}}
      accessibilityRole="button"
      accessibilityLabel={`${t.likedSongs.recoTitle}, ${t.likedSongs.recoSubtitle}`}
      style={styles.reco}>
      <View style={styles.recoIcon}><SparkleIcon size={18} color={colors.accent} /></View>
      <View style={styles.recoText}>
        <Text variant="callout" style={styles.recoTitle}>{t.likedSongs.recoTitle}</Text>
        <Text variant="footnote" color="textSecondary" numberOfLines={1}>{t.likedSongs.recoSubtitle}</Text>
      </View>
      <View style={styles.chevron}><BackArrowIcon size={16} color={colors.separator} /></View>
    </Pressable>
  );

  const hero = (
    <View>
      <View style={styles.hero}>
        <Raised radius={radii.button}><LikedCover size={COVER} borderRadius={radii.button} /></Raised>
        <Text variant="title2" style={styles.title}>{t.likedSongs.title}</Text>
        <Text variant="footnote" color="textSecondary">{meta}</Text>
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
      {recoCard}
      {liked.length > 6 ? (
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder={t.likedSongs.searchPlaceholder} />
        </View>
      ) : null}
    </View>
  );

  const side = (
    <View>
      <Raised radius={radii.tile} style={styles.sideCover}><LikedCover size={SIDE_COVER} borderRadius={radii.tile} /></Raised>
      <Text variant="title3" style={styles.sideTitle}>{t.likedSongs.title}</Text>
      <Text variant="footnote" color="textSecondary">{meta}</Text>
      <View style={styles.sidePlay}>{playRow}</View>
      <View style={styles.sideReco}>{recoCard}</View>
    </View>
  );

  return (
    <>
      <DetailScaffold
        title={t.likedSongs.title}
        tint={LIKED_COVER_COLORS[0]}
        hero={hero}
        side={side}
        showTitleAt={COVER + 36}
        data={shown}
        renderItem={renderItem}
        keyExtractor={s => String(s.id)}
        loading={loading}
        empty={failed ? <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} action={{label: t.common.retry, onPress: retry}} /> : <EmptyState title={query.trim() ? t.allSongs.searchEmpty : t.likedSongs.emptyState} />}
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
  hero: {alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.s, gap: 2},
  title: {marginTop: 16},
  playSpacing: {paddingTop: 18, paddingBottom: 12},
  reco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.gutter,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.button,
    backgroundColor: colors.surface1,
    overflow: 'hidden',
  },
  recoIcon: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center'},
  recoText: {flex: 1, minWidth: 0, gap: 1},
  recoTitle: {fontWeight: '600'},
  chevron: {transform: [{scaleX: -1}]},
  search: {paddingHorizontal: spacing.gutter, paddingBottom: 6},
  sideCover: {alignSelf: 'flex-start'},
  sideTitle: {fontWeight: '700', marginTop: 12},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
  sideReco: {marginTop: 16, marginHorizontal: -spacing.gutter},
});
