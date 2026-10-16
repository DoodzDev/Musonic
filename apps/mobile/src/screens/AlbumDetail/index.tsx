/**
 * @file index.tsx
 * @description Album screen (Design v2, R5.4). Large cover, title, artist
 *   (opens the artist) and "genre · year · quality"; Play and Shuffle; round
 *   actions Add to library / Download / More; the numbered tracks (shared
 *   `TrackRow`: like, add to a playlist, download, long press = track menu);
 *   then the track count, length and release year. Online albums
 *   (`ext-deezer-album-…`) are imported to the server when added to the
 *   library. Playback goes through the playback engine (playFromList).
 * @author DoodzProg
 * @version 2.0.1
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {GlassButton, PlayShuffleRow, RoundAction} from '../../components/detail/DetailParts';
import {usePlayButton} from '../../hooks/usePlayButton';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import Badge from '../../components/ui/Badge';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import CoverArt from '../../components/CoverArt';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import AlbumOptionsSheet from '../../components/AlbumOptionsSheet';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import {showToast} from '../../components/Toast';
import {CheckIcon, DotsHorizontalIcon, DownloadIcon, PlusIcon} from '../../components/icons';
import {playFromList} from '../../services/playback/launchers';
import {playbackEngine} from '../../services/playback/engine';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import {subsonicGet, getCoverArtUrl, getStreamUrl} from '../../api/client';
import {qualityLabel} from '../../utils/quality';
import {colors, radii, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import type {SubsonicSong} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';

const COVER = 264;
const SIDE_COVER = 128;

type AlbumInfo = {
  name: string;
  artist: string;
  artistId?: string;
  year?: number | string;
  genre?: string;
  coverArt?: string;
  starred: boolean;
};

export default function AlbumDetailScreen() {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams, 'AlbumDetail'>>();
  const {albumId} = useRoute<RouteProp<LibraryStackParams, 'AlbumDetail'>>().params;

  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [songs, setSongs] = useState<SubsonicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [starPending, setStarPending] = useState(false);
  const [starting, setStarting] = useState(false);

  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);
  const [albumMenu, setAlbumMenu] = useState(false);
  const [addTo, setAddTo] = useState<SubsonicSong | null>(null);

  const active = useActiveTrack();
  const {state} = usePlaybackState();
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const likedSongIds = usePlayerStore(s => s.likedSongIds);
  const overrides = usePlayerStore(s => s.localLikeOverrides);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const downloads = useDownloadStore(s => s.downloads);
  const activeDownloads = useDownloadStore(s => s.activeDownloads);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    subsonicGet<any>('getAlbum.view', {id: albumId})
      .then(res => {
        const a = res.album || {};
        setAlbum({
          name: a.name ?? '',
          artist: a.artist ?? '',
          artistId: a.artistId ? String(a.artistId) : undefined,
          year: a.year,
          genre: a.genre,
          coverArt: a.coverArt,
          starred: !!a.starred,
        });
        setSongs(a.song || []);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [albumId]);

  useEffect(load, [load]);

  const name = album?.name ?? '';
  const artistName = album?.artist ?? '';
  const coverArtId = album?.coverArt;
  const isStarred = album?.starred ?? false;
  const setStarred = (starred: boolean) => setAlbum(a => (a ? {...a, starred} : a));

  // ─── Library (star), with the import of online albums ─────────────────────

  const toggleStar = useCallback(async () => {
    if (starPending || !album) return;
    const d = getT();
    // Unstar: an online album needs the server id it got when imported.
    if (isStarred) {
      const nativeId = albumId.startsWith('ext-') ? usePlayerStore.getState().localImportedIds[albumId] : albumId;
      setStarred(false);
      try {
        if (nativeId) await subsonicGet('unstar.view', {albumId: nativeId});
        showToast(d.albumDetail.removedFromLibrary);
      } catch {
        setStarred(true);
      }
      return;
    }
    if (!albumId.startsWith('ext-')) {
      setStarred(true);
      try {
        await subsonicGet('star.view', {albumId});
        showToast(d.albumDetail.addedToLibrary);
      } catch {
        setStarred(false);
      }
      return;
    }
    // Online album already imported this session: star its server copy.
    const cachedId = usePlayerStore.getState().localImportedIds[albumId];
    if (cachedId) {
      setStarred(true);
      try {
        await subsonicGet('star.view', {albumId: cachedId});
        showToast(d.albumDetail.addedToLibrary);
        return;
      } catch {
        setStarred(false);
      }
    }
    // Import: the server only registers the album once its tracks have been
    // streamed. Start every online track, then look for the server album.
    setStarPending(true);
    showToast(d.albumDetail.importingAlbum);
    songs.forEach(s => {
      const id = String(s.id);
      if (id.startsWith('ext-')) {
        fetch(getStreamUrl(id), {headers: {Range: 'bytes=0-8192'}}).then(r => r.arrayBuffer()).catch(() => {});
      }
    });
    let found: string | null = null;
    for (let attempt = 0; attempt < 25 && !found; attempt++) {
      await new Promise<void>(r => setTimeout(r, 3000));
      if (attempt === 10) showToast(d.albumDetail.stillImportingAlbum);
      try {
        const res = await subsonicGet<any>('search3.view', {query: album.name, songCount: 0, albumCount: 5, artistCount: 0});
        const match = (res.searchResult3?.album ?? []).find((a: any) =>
          !String(a.id).startsWith('ext-') && a.name === album.name && (!album.artist || a.artist === album.artist));
        if (match) found = String(match.id);
      } catch {
        // Keep polling.
      }
    }
    setStarPending(false);
    if (!found) {
      showToast(d.albumDetail.importError);
      return;
    }
    const resolved = found;
    usePlayerStore.setState(s => ({localImportedIds: {...s.localImportedIds, [albumId]: resolved}}));
    try {
      await subsonicGet('star.view', {albumId: resolved});
      setStarred(true);
      showToast(d.albumDetail.addedToLibrary);
    } catch {
      showToast(d.albumDetail.importError);
    }
  }, [starPending, album, isStarred, albumId, songs]);

  // ─── Playback ─────────────────────────────────────────────────────────────

  const tracks = useMemo((): Track[] => songs.map(s => {
    const cover = s.coverArt || coverArtId || s.id;
    return {
      id: s.id,
      title: s.title || getT().home.unknownTitle,
      artist: s.artist || getT().artistDetail.unknownArtist,
      artistId: s.artistId,
      album: s.album || name || getT().albumDetail.unknownAlbum,
      duration: s.duration || 0,
      coverArt: cover,
      streamUrl: getStreamUrl(s.id),
      url: getStreamUrl(s.id),
      artwork: getCoverArtUrl(cover, 300),
    } as Track;
  }), [songs, name, coverArtId]);

  const source = useMemo(() => ({type: 'album' as const, id: albumId, name}), [albumId, name]);

  const playAll = useCallback(async () => {
    if (!tracks.length) return;
    setStarting(true);
    try {
      // The engine applies shuffle and offline itself.
      await playFromList(source, tracks);
    } finally {
      setStarting(false);
    }
  }, [source, tracks]);

  const playButton = usePlayButton(tracks, playAll);

  const addToQueue = useCallback(async () => {
    if (!tracks.length) return;
    try {
      await playbackEngine.playNext(tracks);
      showToast(getT().playlistOptions.queuedToast(tracks.length));
    } catch {
      showToast(getT().playlistOptions.queueError);
    }
  }, [tracks]);

  // ─── Downloads ────────────────────────────────────────────────────────────

  const downloadable = useMemo(() => songs.filter(s => !String(s.id).startsWith('ext-')), [songs]);
  const allDownloaded = downloadable.length > 0 && downloadable.every(s => !!downloads[String(s.id)]);
  const download = useCallback(() => {
    const d = getT();
    if (allDownloaded) {
      Alert.alert(d.downloads.deletePlaylistTitle, d.downloads.deletePlaylistMessage(name, downloadable.length), [
        {text: d.downloads.cancelButton, style: 'cancel'},
        {
          text: d.downloads.deleteConfirm,
          style: 'destructive',
          onPress: () => downloadable.forEach(s => useDownloadStore.getState().deleteDownload(String(s.id))),
        },
      ]);
      return;
    }
    useDownloadStore.getState().enqueueBatch(songs);
    showToast(d.songOptions.downloadQueued);
  }, [allDownloaded, downloadable, songs, name]);

  const openArtist = useCallback(() => {
    if (album?.artistId || album?.artist) navigation.navigate('ArtistDetail', {artistId: album.artistId, artistName: album.artist});
  }, [navigation, album]);

  // ─── Rows ─────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({item, index}: {item: SubsonicSong; index: number}) => {
    const id = String(item.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.title}
        // Only when it differs (featurings, compilations).
        subtitle={item.artist && item.artist !== artistName ? item.artist : undefined}
        number={item.track || index + 1}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playFromList(source, tracks, index)}
        onLongPress={() => setMenuSong(item)}
        onToggleLike={() => toggleLike(id, item.title, item.artist)}
        onAddToPlaylist={() => setAddTo(item)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item)}
      />
    );
  }, [active?.id, state, artistName, overrides, likedSongIds, downloads, activeDownloads, source, tracks, toggleLike]);

  // ─── Hero ─────────────────────────────────────────────────────────────────

  const quality = songs[0] ? qualityLabel(songs[0]) : null;
  const meta = [album?.genre, album?.year].filter(Boolean).join(' · ');
  const totalSeconds = songs.reduce((sum, s) => sum + (s.duration || 0), 0);

  const metaLine = (
    <View style={styles.metaRow}>
      {meta ? <Text variant="footnote" color="textSecondary">{meta}</Text> : null}
      {quality ? <Badge kind="quality" size="small" label={quality} /> : null}
    </View>
  );

  const actions = (
    <>
      <RoundAction
        icon={isStarred ? <CheckIcon size={20} color={colors.accent} strokeWidth={2.6} /> : <PlusIcon size={20} color={colors.textPrimary} strokeWidth={2.6} />}
        label={isStarred ? t.albumDetail.added : t.albumDetail.add}
        active={isStarred}
        busy={starPending}
        onPress={toggleStar}
      />
      <RoundAction
        icon={<DownloadIcon size={20} color={allDownloaded ? colors.success : colors.textPrimary} />}
        label={allDownloaded ? t.albumDetail.downloaded : t.albumDetail.download}
        onPress={download}
      />
      <RoundAction
        icon={<DotsHorizontalIcon size={20} color={colors.textPrimary} />}
        label={t.albumDetail.more}
        onPress={() => setAlbumMenu(true)}
      />
    </>
  );

  const playRow = (
    <PlayShuffleRow onPlay={playButton.onPlay} playing={playButton.playing} onShuffle={toggleShuffle} shuffleMode={shuffleMode} loading={starting} disabled={!tracks.length} />
  );

  const hero = album ? (
    <View>
      <View style={styles.hero}>
        <Raised radius={radii.button}>
          <CoverArt id={coverArtId} size={COVER} borderRadius={radii.button} />
        </Raised>
        <Text variant="title2" numberOfLines={2} style={styles.title}>{name}</Text>
        <PressableScale onPress={openArtist} hitSlop={6} accessibilityLabel={artistName}>
          <Text variant="title3" numberOfLines={1} style={styles.artist}>{artistName || t.artistDetail.unknownArtist}</Text>
        </PressableScale>
        {metaLine}
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
      <View style={styles.actions}>{actions}</View>
    </View>
  ) : null;

  const side = album ? (
    <View style={styles.side}>
      <View style={styles.sideTop}>
        <Raised radius={radii.tile}>
          <CoverArt id={coverArtId} size={SIDE_COVER} borderRadius={radii.tile} />
        </Raised>
      </View>
      <Text variant="title3" numberOfLines={2} style={styles.sideTitle}>{name}</Text>
      <PressableScale onPress={openArtist} hitSlop={6} accessibilityLabel={artistName}>
        <Text variant="headline" numberOfLines={1} style={[styles.artist, styles.sideArtist]}>{artistName || t.artistDetail.unknownArtist}</Text>
      </PressableScale>
      <View style={styles.sideMeta}>{metaLine}</View>
      <View style={styles.sideActions}>{actions}</View>
      <View style={styles.sidePlay}>{playRow}</View>
    </View>
  ) : null;

  const footer = songs.length ? (
    <Text variant="footnote" color="textSecondary" style={styles.footer}>
      {t.detail.summary(songs.length, totalSeconds)}
      {album?.year ? `\n${t.albumDetail.released(album.year)}` : ''}
    </Text>
  ) : null;

  return (
    <>
      <DetailScaffold
        title={name}
        coverId={coverArtId}
        topRight={album ? (
          <GlassButton icon={<DotsHorizontalIcon size={20} color={colors.textPrimary} />} onPress={() => setAlbumMenu(true)} accessibilityLabel={t.albumDetail.options} />
        ) : null}
        hero={hero}
        side={side}
        showTitleAt={COVER + 40}
        data={songs}
        renderItem={renderItem}
        keyExtractor={(s, i) => `${s.id}-${i}`}
        footer={footer}
        loading={loading}
        empty={failed ? <EmptyState title={t.albumDetail.loadError} action={{label: t.common.retry, onPress: load}} /> : null}
      />

      <SongOptionsSheet
        visible={!!menuSong}
        onClose={() => setMenuSong(null)}
        track={menuSong}
        onToast={showToast}
        onNavigateAlbum={id => navigation.push('AlbumDetail', {albumId: id})}
        onNavigateArtist={(id, artist) => navigation.navigate('ArtistDetail', {artistId: id, artistName: artist})}
      />
      <AlbumOptionsSheet
        visible={albumMenu}
        onClose={() => setAlbumMenu(false)}
        albumName={name}
        coverArtId={coverArtId}
        isStarred={isStarred}
        onToggleStar={toggleStar}
        onGoToArtist={album?.artistId ? openArtist : undefined}
        onAddToQueue={addToQueue}
        trackIds={songs.map(s => String(s.id))}
        onToast={showToast}
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
  hero: {alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.s},
  title: {textAlign: 'center', marginTop: 20},
  artist: {color: colors.accent, textAlign: 'center'},
  metaRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4},
  playSpacing: {paddingTop: 20, paddingBottom: 14},
  actions: {flexDirection: 'row', justifyContent: 'center', gap: 20, paddingBottom: 14},
  footer: {paddingHorizontal: spacing.gutter, paddingTop: spacing.m},
  side: {gap: 2},
  sideTop: {alignItems: 'flex-start', marginBottom: 12},
  sideTitle: {fontWeight: '700'},
  sideArtist: {textAlign: 'left'},
  sideMeta: {alignItems: 'flex-start'},
  sideActions: {flexDirection: 'row', gap: 4, marginTop: 14, marginLeft: -10},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
});
