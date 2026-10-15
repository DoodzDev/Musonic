/**
 * @file index.tsx
 * @description Home screen (Design v2, R5.1 + R5.11). Date and large title,
 *   filter chips (All, Playlists, Albums, Artists), a 2 × 3 quick access grid
 *   (3 × 2 in landscape), then the shelves of the shared home engine
 *   (`@musonic/core/home`, the same as the web, varying day to day), with the
 *   online "For you" cards and "Artists to discover" after "Recently played",
 *   and the Magic Mixes (opened like playlists). "Recently played" lists
 *   what you really played (recentPlaysStore: the track alone, else the album,
 *   playlist, mix… launched), completed by the server's recent albums. Every
 *   card says what it is (album, track, playlist). Covers and cards use the
 *   shared raised relief. The last feed is kept on the device, so the Home
 *   also shows offline. Playback goes through the playback engine.
 * @author DoodzProg
 * @version 2.1.0
 * @license MIT
 */

import React, {useCallback, useMemo, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, View} from 'react-native';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import type {CardItem, Shelf} from '@musonic/core/home';
import {useHomeFeed} from '../../hooks/useHomeFeed';
import {useRecentPlaysStore, type RecentPlay} from '../../store/recentPlaysStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {largeDeezerCover, useOnlineRecommendations} from '../../hooks/useOnlineRecommendations';
import {playAlbumById, playFromList} from '../../services/playback/launchers';
import {songToTrack} from '../../utils/songToTrack';
import {LargeTitle, LargeTitleHeader, useLargeTitleInset, useLargeTitleScroll} from '../../components/ui/LargeTitleHeader';
import Chip from '../../components/ui/Chip';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import ProfileButton from '../../components/shell/ProfileButton';
import {
  AlbumCard,
  ArtistBubble,
  ForYouCard,
  HOME_GUTTER,
  HomeShelf,
  MixCard,
  QuickTile,
} from '../../components/home/HomeCards';
import {colors} from '../../theme';
import {useT} from '../../i18n';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useDockInset} from '../../navigation/dockLayout';

type Filter = 'all' | 'playlists' | 'albums' | 'artists';
const FILTERS: Filter[] = ['all', 'playlists', 'albums', 'artists'];
const QUICK_COUNT = 6;

/** Which filter shows a shelf of this kind. */
function shownBy(kind: Shelf['kind']): Filter {
  if (kind === 'artists') return 'artists';
  if (kind === 'mixes') return 'playlists';
  return 'albums';
}

export default function HomeScreen() {
  const t = useT();
  const navigation = useNavigation<any>();
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const isLandscape = useIsLandscape();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();
  const {feed, loading, stale, refresh} = useHomeFeed();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Seeds of the online parts: the artists you played lately and your favourite ones.
  const recentShelf = feed?.shelves.find(s => s.id === 'recent');
  const recentArtists = useMemo(() => {
    const names = (recentShelf?.items ?? []).flatMap(i => (i.type === 'album' && i.album.artist ? [i.album.artist] : []));
    return [...new Set(names)].slice(0, 4);
  }, [recentShelf]);
  const favoriteArtistIds = useMemo(() => {
    const shelf = feed?.shelves.find(s => s.id === 'favoriteArtists');
    return (shelf?.items ?? []).flatMap(i => (i.type === 'artist' ? [i.artist.id] : [])).slice(0, 3);
  }, [feed]);
  const online = useOnlineRecommendations(recentArtists, favoriteArtistIds);

  // "Recently played": what was really played on this device, then the server's recent albums.
  const plays = useRecentPlaysStore(s => s.plays);
  const cachedPlaylists = usePlaylistCacheStore(s => s.cachedPlaylists);
  type RecentItem = {key: string; play?: RecentPlay; album?: {id: string; name: string; artist?: string; coverArt?: string; songCount?: number}};
  const recentItems = useMemo<RecentItem[]>(() => {
    const items: RecentItem[] = plays.map(p => ({key: `${p.kind}-${p.id}`, play: p}));
    const playedAlbums = new Set(plays.filter(p => p.kind === 'album').map(p => p.id));
    for (const i of recentShelf?.items ?? []) {
      if (items.length >= 12) break;
      if (i.type === 'album' && !playedAlbums.has(i.album.id)) items.push({key: `srv-${i.album.id}`, album: i.album});
    }
    return items.slice(0, 12);
  }, [plays, recentShelf]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openAlbum = useCallback((album: {id: string; songCount?: number}) => {
    if (album.songCount === 1) playAlbumById(album.id);
    else navigation.navigate('AlbumDetail', {albumId: album.id});
  }, [navigation]);

  const show = (f: Filter) => filter === 'all' || filter === f;

  const renderCard = useCallback((shelf: Shelf, item: CardItem, index: number): React.ReactElement => {
    switch (item.type) {
      case 'album':
        return <AlbumCard name={item.album.name} subtitle={albumLine(item.album)} coverId={item.album.coverArt} onPress={() => openAlbum(item.album)} />;
      case 'artist':
        return (
          <ArtistBubble
            name={item.artist.name}
            coverId={item.artist.coverArt ?? item.fallbackCoverArt}
            imageUrl={item.artist.artistImageUrl}
            onPress={() => navigation.navigate('ArtistDetail', {artistId: item.artist.id})}
          />
        );
      case 'song': {
        const songs = shelf.items.flatMap(i => (i.type === 'song' ? [i.song] : []));
        return (
          <AlbumCard
            name={item.song.title}
            subtitle={t.home.kindLine(t.home.typeSingle, item.song.artist)}
            coverId={item.song.coverArt}
            onPress={() => playFromList({type: 'recommendations', name: shelfTitle(shelf)}, songs.map(songToTrack), index)}
          />
        );
      }
      case 'mix': {
        const artists = [...new Set(item.songs.map(s => s.artist).filter((a): a is string => !!a))].slice(0, 2);
        return (
          <MixCard
            name={item.genre}
            subtitle={t.home.kindLine(t.home.typePlaylist, artists.length ? `${artists.join(', ')}…` : undefined)}
            covers={item.covers}
            accessibilityLabel={`${item.genre}, ${t.home.mixSubtitle(item.songs.length)}`}
            onPress={() => navigation.navigate('MixDetail', {genre: item.genre, songs: item.songs, covers: item.covers})}
          />
        );
      }
      default:
        return <View />;
    }
    // shelfTitle is stable for a given language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, openAlbum, t]);

  function albumLine(album: {songCount?: number; artist?: string}): string {
    return t.home.kindLine(album.songCount === 1 ? t.home.typeSingle : t.home.typeAlbum, album.artist);
  }

  function renderRecent(item: RecentItem): React.ReactElement {
    if (item.album) {
      const album = item.album;
      return <AlbumCard name={album.name} subtitle={albumLine(album)} coverId={album.coverArt} onPress={() => openAlbum(album)} />;
    }
    const p = item.play!;
    switch (p.kind) {
      case 'album':
        return <AlbumCard name={p.name} subtitle={t.home.kindLine(t.home.typeAlbum, p.artist)} coverId={p.coverArt} onPress={() => openAlbum({id: p.id})} />;
      case 'playlist': {
        const pl = cachedPlaylists.find(x => x.id === p.id);
        return (
          <AlbumCard name={pl?.name ?? p.name} subtitle={t.home.typePlaylist} coverId={pl?.coverArt ?? p.coverArt} playlistId={p.id}
            onPress={() => navigation.navigate('PlaylistDetail', {playlistId: p.id})} />
        );
      }
      case 'liked':
        return <AlbumCard name={t.home.likedSongs} subtitle={t.home.typePlaylist} special="liked" onPress={() => navigation.navigate('LikedSongs')} />;
      case 'library':
        return <AlbumCard name={t.home.myMusic} subtitle={t.home.typePlaylist} special="library" onPress={() => navigation.navigate('Library', {screen: 'AllSongs'})} />;
      case 'mix':
        return (
          <MixCard name={p.name} subtitle={t.home.typePlaylist} covers={p.coverArt ? [p.coverArt] : []}
            accessibilityLabel={`${p.name}, ${t.home.typePlaylist}`} onPress={() => navigation.navigate('MixDetail', {genre: p.id})} />
        );
      case 'artist':
        return <ArtistBubble name={p.name} coverId={p.coverArt} onPress={() => navigation.navigate('ArtistDetail', {artistId: p.id})} />;
      default:
        return (
          <AlbumCard name={p.name} subtitle={t.home.kindLine(t.home.typeSingle, p.artist)} coverId={p.coverArt}
            onPress={() => playFromList({type: 'other'}, [songToTrack({id: p.id, title: p.name, artist: p.artist, coverArt: p.coverArt})])} />
        );
    }
  }

  function shelfTitle(shelf: Shelf): string {
    const s = t.home.sections;
    switch (shelf.id) {
      case 'recent': return s.recent;
      case 'favoriteArtists': return s.favoriteArtists;
      case 'moreLike': return s.moreLike(shelf.context ?? '');
      case 'likedAlbums': return s.likedAlbums;
      case 'becauseLiked': return s.becauseLiked(shelf.context ?? '');
      case 'magicMixes': return s.magicMixes;
      case 'rediscover': return s.rediscover;
      case 'newest': return s.newest;
      default: return s.random;
    }
  }

  const renderShelf = (shelf: Shelf) =>
    show(shownBy(shelf.kind)) ? (
      <HomeShelf
        key={shelf.id}
        title={shelfTitle(shelf)}
        subtitle={shelf.id === 'magicMixes' ? t.home.sections.magicMixesSubtitle : undefined}
        data={shelf.items}
        keyOf={(item, i) => `${shelf.id}-${i}`}
        renderItem={(item, i) => renderCard(shelf, item, i)}
        gap={shelf.kind === 'artists' ? 16 : 14}
      />
    ) : null;

  // Quick access: liked songs, recent playlists and albums (2 × 3; 3 × 2 in landscape).
  const quickCols = isLandscape ? 3 : 2;
  const quick = (feed?.quickAccess ?? []).slice(0, QUICK_COUNT);
  const quickRows: CardItem[][] = [];
  for (let i = 0; i < quick.length; i += quickCols) quickRows.push(quick.slice(i, i + quickCols));

  const quickTile = (item: CardItem) => {
    if (item.type === 'liked') {
      return <QuickTile key="liked" kind="liked" name={t.home.likedSongs} kindLabel={t.home.typePlaylist} onPress={() => navigation.navigate('LikedSongs')} />;
    }
    if (item.type === 'playlist') {
      const p = item.playlist;
      return (
        <QuickTile key={`p-${p.id}`} kind="playlist" name={p.name} kindLabel={t.home.typePlaylist} coverId={p.coverArt} playlistId={p.id}
          onPress={() => navigation.navigate('PlaylistDetail', {playlistId: p.id})} />
      );
    }
    if (item.type === 'album') {
      return (
        <QuickTile key={`a-${item.album.id}`} kind="album" name={item.album.name} coverId={item.album.coverArt}
          kindLabel={item.album.songCount === 1 ? t.home.typeSingle : t.home.typeAlbum} onPress={() => openAlbum(item.album)} />
      );
    }
    return null;
  };

  const otherShelves = (feed?.shelves ?? []).filter(s => s.id !== 'recent' && s.id !== 'magicMixes');
  const mixesShelf = feed?.shelves.find(s => s.id === 'magicMixes');

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={isFullscreenMode} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingTop: top, paddingBottom: dockInset + 16}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} progressViewOffset={top} />}>

        <Text variant="footnote" color="textSecondary" style={styles.date}>
          {t.home.date(new Date()).toUpperCase()}
        </Text>
        <LargeTitle title={t.home.title} scrollY={scrollY} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          {FILTERS.map(f => (
            <Chip key={f} label={t.home.filters[f]} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        {stale && feed ? (
          <Text variant="footnote" color="textSecondary" style={styles.offlineNote}>
            {isOfflineMode ? t.home.offlineSaved : t.home.loadError}
          </Text>
        ) : null}

        {!feed && loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}

        {!feed && !loading ? (
          <View style={styles.empty}>
            <Text variant="subhead" color="textSecondary" style={styles.emptyText}>
              {isOfflineMode ? t.home.offlineEmptyState : t.home.loadError}
            </Text>
            {!isOfflineMode ? <Button variant="plain" label={t.common.retry} onPress={refresh} /> : null}
          </View>
        ) : null}

        {show('playlists') && quickRows.length > 0 ? (
          <View style={styles.quickGrid}>
            {quickRows.map((row, i) => (
              <View key={i} style={styles.quickRow}>
                {row.map(quickTile)}
                {Array.from({length: quickCols - row.length}, (_, k) => <View key={`gap-${k}`} style={styles.quickGap} />)}
              </View>
            ))}
          </View>
        ) : null}

        {show('albums') ? (
          <HomeShelf
            title={t.home.sections.recent}
            data={recentItems}
            keyOf={item => item.key}
            renderItem={item => renderRecent(item)}
          />
        ) : null}

        {show('albums') ? (
          <HomeShelf
            title={t.home.sections.forYou}
            subtitle={online.basedOn.length ? t.home.sections.forYouFrom(online.basedOn.join(', ')) : undefined}
            data={online.forYou}
            keyOf={item => `fy-${item.album.id}`}
            renderItem={item => (
              <ForYouCard
                title={item.album.title}
                subtitle={t.home.kindLine(t.home.typeAlbum, item.artist.name)}
                imageUrl={largeDeezerCover(item.album.cover_medium)}
                onPress={() => navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${item.album.id}`})}
                onPlay={() => playAlbumById(`ext-deezer-album-${item.album.id}`)}
                playLabel={t.home.playAlbum(item.album.title)}
              />
            )}
          />
        ) : null}

        {show('artists') ? (
          <HomeShelf
            title={t.home.sections.discover}
            data={online.discover}
            keyOf={a => `d-${a.id}`}
            gap={16}
            renderItem={a => (
              <ArtistBubble
                name={a.name}
                coverId={a.coverArt}
                imageUrl={a.artistImageUrl}
                onPress={() => navigation.navigate('ArtistDetail', {artistId: a.id})}
              />
            )}
          />
        ) : null}

        {mixesShelf ? renderShelf(mixesShelf) : null}
        {otherShelves.map(renderShelf)}
      </Animated.ScrollView>

      <LargeTitleHeader title={t.home.title} scrollY={scrollY} align="left" left={<ProfileButton />} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  date: {
    paddingHorizontal: HOME_GUTTER,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  // A horizontal ScrollView may shrink to nothing in a long page: keep its own height.
  chipsScroll: {flexGrow: 0, flexShrink: 0},
  chips: {paddingHorizontal: HOME_GUTTER, gap: 8, paddingTop: 4, paddingBottom: 22},
  offlineNote: {paddingHorizontal: HOME_GUTTER, paddingBottom: 12},
  loading: {marginTop: 48},
  empty: {alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: HOME_GUTTER},
  emptyText: {textAlign: 'center'},
  quickGrid: {paddingHorizontal: HOME_GUTTER, gap: 8, marginBottom: 30},
  quickRow: {flexDirection: 'row', gap: 8},
  quickGap: {flex: 1},
});
