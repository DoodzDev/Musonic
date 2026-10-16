/**
 * @file index.tsx
 * @description Artist screen (Design v2, R5.6). Full-width photo fading into
 *   the background with the name and "N albums · M songs in your library";
 *   Play and Shuffle; the popular tracks (the server's, else the online
 *   ranking, played from the server copy when the song is on it); the
 *   albums; similar artists. Landscape:
 *   photo and actions in a fixed column, the rest scrolls on the right.
 *   Playback goes through the playback engine (playFromList).
 * @author DoodzProg
 * @version 2.1.2
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import DetailScaffold from '../../components/detail/DetailScaffold';
import {PlayShuffleRow} from '../../components/detail/DetailParts';
import {usePlayButton} from '../../hooks/usePlayButton';
import {AlbumCard, ArtistBubble, HomeShelf} from '../../components/home/HomeCards';
import TrackRow from '../../components/ui/TrackRow';
import Text from '../../components/ui/Text';
import Raised from '../../components/ui/Raised';
import SectionHeader from '../../components/ui/SectionHeader';
import EmptyState from '../../components/ui/EmptyState';
import ArtistAvatar from '../../components/ui/ArtistAvatar';
import AddToPlaylistSheet from '../../components/AddToPlaylistSheet';
import SongOptionsSheet from '../../components/SongOptionsSheet';
import {showToast} from '../../components/Toast';
import {subsonicGet, getStreamUrl, getCoverArtUrl} from '../../api/client';
import {getDeezerArtistId, getDeezerArtistTopTracks, getDeezerRelatedArtists, getArtistImage, type DeezerArtist, type DeezerTrack} from '../../api/deezer';
import {playFromList, addSongToQueue} from '../../services/playback/launchers';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {useDownloadStore} from '../../store/downloadStore';
import {useSettingsStore} from '../../store/settingsStore';
import {colors, spacing} from '../../theme';
import {useT, getT} from '../../i18n';
import type {SubsonicAlbum, SubsonicSong} from '../../api/types';
import type {LibraryStackParams} from '../../navigation/types';

const HERO_HEIGHT = 380;
const SIDE_PHOTO = 160;
const POPULAR = 5;

/** A popular track: from the server, or online (Deezer) when the artist is not on it. */
type Popular = {song: SubsonicSong; online: boolean};

function deezerToSong(t: DeezerTrack): SubsonicSong {
  const id = `ext-deezer-song-${t.id}`;
  return {id, title: t.title, artist: t.artist.name, album: t.album.title, duration: t.duration, coverArt: id};
}

const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Popular tracks from the online ranking: each one is the server copy when
 * the artist's albums hold a song with the same title, the online track
 * otherwise. Without a ranking, the artist's server songs.
 */
export function mergePopular(ranking: readonly DeezerTrack[], serverSongs: readonly SubsonicSong[]): Popular[] {
  if (ranking.length === 0) return serverSongs.map(song => ({song, online: String(song.id).startsWith('ext-')}));
  const byTitle = new Map<string, SubsonicSong>();
  for (const s of serverSongs) if (!byTitle.has(fold(s.title))) byTitle.set(fold(s.title), s);
  const out: Popular[] = [];
  const seen = new Set<string>();
  for (const t of ranking) {
    const local = byTitle.get(fold(t.title));
    const song = local ?? deezerToSong(t);
    if (seen.has(String(song.id))) continue;
    seen.add(String(song.id));
    out.push({song, online: String(song.id).startsWith('ext-')});
  }
  return out;
}

function toTrack(s: SubsonicSong): Track {
  const cover = s.coverArt || s.id;
  return {
    id: String(s.id), title: s.title, artist: s.artist, artistId: s.artistId, album: s.album,
    duration: s.duration || 0, coverArt: cover,
    streamUrl: getStreamUrl(s.id), url: getStreamUrl(s.id), artwork: getCoverArtUrl(cover, 300),
  };
}

export default function ArtistDetailScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams, 'ArtistDetail'>>();
  const {artistId: routeId, artistName: routeName} = useRoute<RouteProp<LibraryStackParams, 'ArtistDetail'>>().params;

  const [name, setName] = useState(routeName ?? '');
  const [serverId, setServerId] = useState<string | undefined>(routeId);
  const [photo, setPhoto] = useState<string | null>(null);
  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);
  const [popular, setPopular] = useState<Popular[]>([]);
  const [similar, setSimilar] = useState<DeezerArtist[]>([]);
  const [loading, setLoading] = useState(true);
  // The artist itself could not be loaded; `attempt` reloads.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => { setLoading(true); setAttempt(a => a + 1); };
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const [menuSong, setMenuSong] = useState<SubsonicSong | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        let id = routeId;
        if (!id && routeName) {
          const res = await subsonicGet<any>('search3.view', {query: routeName, artistCount: 5, albumCount: 0, songCount: 0});
          const hit = (res.searchResult3?.artist ?? []).find((a: any) => a.name?.toLowerCase() === routeName.toLowerCase());
          id = hit?.id;
        }
        let artistName = routeName ?? '';
        let serverPopular: Popular[] = [];
        let serverSongs: SubsonicSong[] = [];
        // Online ids (ext-…) are not on the server: no albums, no server top songs.
        if (id && !id.startsWith('ext-')) {
          const res = await subsonicGet<any>('getArtist.view', {id});
          const artist = res.artist || {};
          artistName = artist.name || artistName;
          const artistAlbums: SubsonicAlbum[] = artist.album || [];
          if (!cancelled) {
            setServerId(id);
            setAlbums(artistAlbums);
          }
          const lists = await Promise.all(artistAlbums.slice(0, 8).map(a =>
            subsonicGet<any>('getAlbum.view', {id: a.id}).then(r => (r.album?.song ?? []) as SubsonicSong[]).catch(() => [])));
          serverSongs = lists.flat();
          try {
            const top = await subsonicGet<any>('getTopSongs.view', {artist: artistName, count: 10});
            serverPopular = (top.topSongs?.song ?? []).map((song: SubsonicSong) => ({song, online: String(song.id).startsWith('ext-')}));
          } catch {
            // Top songs are optional.
          }
        }
        if (cancelled) return;
        setName(artistName || getT().artistDetail.unknownArtist);
        setPopular(serverPopular);
        if (!artistName) return;
        getArtistImage(artistName).then(url => { if (!cancelled && url) setPhoto(url); }).catch(() => {});
        const deezerId = await getDeezerArtistId(artistName).catch(() => null);
        if (cancelled) return;
        if (!deezerId) {
          if (serverPopular.length === 0) setPopular(mergePopular([], serverSongs).slice(0, 10));
          return;
        }
        getDeezerRelatedArtists(deezerId, 10).then(list => { if (!cancelled) setSimilar(list); }).catch(() => {});
        if (serverPopular.length === 0) {
          const ranking = await getDeezerArtistTopTracks(deezerId, 10).catch(() => []);
          if (!cancelled) setPopular(mergePopular(ranking, serverSongs).slice(0, 10));
        }
      } catch {
        if (!cancelled) {
          setName(n => n || getT().artistDetail.unknownArtist);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [routeId, routeName, attempt]);

  const tracks = useMemo(() => popular.map(p => toTrack(p.song)), [popular]);
  const source = useMemo(() => ({type: 'artist' as const, id: serverId ?? name, name}), [serverId, name]);
  const playAll = useCallback(() => { if (tracks.length) playFromList(source, tracks); }, [source, tracks]);
  const playButton = usePlayButton(source, playAll);

  // The server also lists online albums (ext-…) of the artist: only its own count as "in your library".
  const ownAlbums = albums.filter(a => !String(a.id).startsWith('ext-'));
  const songTotal = ownAlbums.reduce((sum, a) => sum + (a.songCount || 0), 0);
  const subtitle = ownAlbums.length ? t.artistDetail.inLibrary(ownAlbums.length, songTotal) : t.artistDetail.onlineArtist;
  const shown = popular.slice(0, POPULAR);

  const renderItem = useCallback(({item, index}: {item: Popular; index: number}) => {
    const id = String(item.song.id);
    const isCurrent = active?.id != null && String(active.id) === id;
    const dl = activeDownloads[id];
    return (
      <TrackRow
        title={item.song.title}
        subtitle={item.song.album}
        coverId={item.song.coverArt}
        badges={item.online ? ['online'] : undefined}
        playback={isCurrent ? (state === State.Playing ? 'playing' : 'current') : 'idle'}
        liked={overrides[id] ?? likedSongIds.has(id)}
        download={id in downloads ? 'done' : dl && (dl.status === 'queued' || dl.status === 'downloading') ? 'downloading' : 'none'}
        onPress={() => playFromList(source, tracks, index)}
        onLongPress={() => setMenuSong(item.song)}
        onToggleLike={() => toggleLike(id, item.song.title, item.song.artist)}
        onAddToPlaylist={() => setAddTo(item.song)}
        onDownload={() => useDownloadStore.getState().enqueueTrack(item.song)}
        onAddToQueue={() => addSongToQueue(item.song)}
      />
    );
  }, [active?.id, state, overrides, likedSongIds, downloads, activeDownloads, source, tracks, toggleLike]);

  const playRow = (
    <PlayShuffleRow onPlay={playButton.onPlay} playing={playButton.playing} onShuffle={toggleShuffle} shuffleMode={shuffleMode} disabled={!tracks.length} />
  );

  const popularTitle = shown.length ? (
    <View style={styles.sectionHeader}><SectionHeader title={t.artistDetail.popularSongs} /></View>
  ) : null;

  const hero = (
    <View>
      <View style={[styles.photo, {height: HERO_HEIGHT + insets.top}]}>
        {photo ? <Image source={{uri: photo}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, styles.noPhoto]} />}
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', colors.background]} locations={[0.45, 0.8, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroText}>
          <Text variant="largeTitle" numberOfLines={2} style={styles.name}>{name}</Text>
          {subtitle ? <Text variant="footnote" style={styles.heroSub}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.playSpacing}>{playRow}</View>
      {popularTitle}
    </View>
  );

  const side = (
    <View>
      <Raised radius={SIDE_PHOTO / 2} shadow={false} style={styles.sideCover}>
        <ArtistAvatar name={name} imageUrl={photo ?? undefined} size={SIDE_PHOTO} />
      </Raised>
      <Text variant="title2" numberOfLines={2} style={styles.sideName}>{name}</Text>
      {subtitle ? <Text variant="footnote" color="textSecondary">{subtitle}</Text> : null}
      <View style={styles.sidePlay}>{playRow}</View>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <HomeShelf
        title={t.artistDetail.albums}
        data={albums}
        keyOf={a => a.id}
        renderItem={a => (
          <AlbumCard
            name={a.name}
            subtitle={[a.year, String(a.id).startsWith('ext-') ? t.ui.badgeOnline : ''].filter(Boolean).join(' · ') || undefined}
            coverId={a.coverArt} onPress={() => navigation.push('AlbumDetail', {albumId: a.id})} />
        )}
      />
      <HomeShelf
        title={t.artistDetail.similarArtists}
        data={similar}
        keyOf={a => `sim-${a.id}`}
        gap={16}
        renderItem={a => (
          <ArtistBubble name={a.name} imageUrl={a.picture_medium} onPress={() => navigation.push('ArtistDetail', {artistName: a.name})} />
        )}
      />
    </View>
  );

  return (
    <>
      <DetailScaffold
        title={name}
        fullBleed
        hero={hero}
        side={side}
        showTitleAt={HERO_HEIGHT - 60}
        data={shown}
        renderItem={renderItem}
        keyExtractor={p => String(p.song.id)}
        footer={footer}
        loading={loading}
        empty={failed
          ? isOfflineMode
            ? <EmptyState title={t.common.offlineUnavailable} message={t.common.offlineUnavailableMessage} />
            : <EmptyState title={t.common.loadError} message={t.common.loadErrorMessage} action={{label: t.common.retry, onPress: retry}} />
          : !albums.length ? <EmptyState title={t.artistDetail.empty} /> : null}
      />
      <SongOptionsSheet
        visible={!!menuSong}
        onClose={() => setMenuSong(null)}
        track={menuSong}
        onToast={showToast}
        onNavigateAlbum={albumId => navigation.push('AlbumDetail', {albumId})}
        onNavigateArtist={(artistId, artistName) => navigation.push('ArtistDetail', {artistId, artistName})}
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
  photo: {justifyContent: 'flex-end', overflow: 'hidden'},
  noPhoto: {backgroundColor: colors.surface1},
  heroText: {paddingHorizontal: spacing.gutter, paddingBottom: spacing.m, gap: 4},
  name: {fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1},
  heroSub: {color: 'rgba(255,255,255,0.75)'},
  playSpacing: {paddingTop: 14, paddingBottom: 22},
  sectionHeader: {paddingHorizontal: spacing.gutter, paddingBottom: 4},
  footer: {paddingTop: 26},
  sideCover: {alignSelf: 'flex-start'},
  sideName: {marginTop: 12},
  sidePlay: {marginTop: 16, marginHorizontal: -spacing.gutter},
});

