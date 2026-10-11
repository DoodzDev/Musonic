/**
 * @file index.tsx
 * @description Home screen. Displays personalised quick-access cards, recently
 *   played albums, frequently played albums, AI-recommended songs, and a discover
 *   section of similar artists. Supports filter pills, pull-to-refresh, and
 *   auto-recovery when connectivity is restored.
 * @author DoodzProg
 * @version 1.2.0
 * @license MIT
 */

import React, {useEffect, useState, useCallback, useRef} from 'react';
import {
  View,
  ScrollView,
  FlatList,
  StyleSheet,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {darkTheme} from '../../theme';
import {
  getRecentAlbums,
  getFrequentAlbums,
  getStarred,
  getSimilarArtists,
} from '../../api/endpoints/library';
import {getPlaylists} from '../../api/endpoints/playlists';
import {
  getArtistImage,
  getDeezerArtistId,
  getDeezerArtistTopTracks,
  enrichTracksWithAlbumType,
  type DeezerTrack,
} from '../../api/deezer';
import {loadAndPlayAlbum} from '../../services/playerActions';
import {usePlayerStore} from '../../store/playerStore';
import type {SubsonicAlbum, SubsonicSimilarArtist, SubsonicPlaylist} from '../../api/types';
import AlbumCard from '../../components/AlbumCard';
import ArtistCard from '../../components/ArtistCard';
import QuickAccessCard from '../../components/QuickAccessCard';
import SectionHeader from '../../components/SectionHeader';
import HeartIcon from '../../components/icons/HeartIcon';
import GlobalHeader from '../../components/GlobalHeader';
import {useT} from '../../i18n';
import {useNetworkStore} from '../../store/networkStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useDockInset} from '../../navigation/dockLayout';

type FilterKey = 'all' | 'recent' | 'frequent' | 'reco' | 'discover';

function homeDedupeById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

function homeDedupeAlbums(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => {
    if (t.isSingle) return true;
    if (seen.has(t.album.id)) return false;
    seen.add(t.album.id);
    return true;
  });
}

type HomeData = {
  recentAlbums: SubsonicAlbum[];
  frequentAlbums: SubsonicAlbum[];
  deezerRecoAlbums: DeezerTrack[];
  discoverArtists: SubsonicSimilarArtist[];
  playlists: SubsonicPlaylist[];
  likedCount: number;
};

export default function HomeScreen() {
  const dockInset = useDockInset();
  const t = useT();
  const filters: {key: FilterKey; label: string}[] = [
    {key: 'all', label: t.home.filters.all},
    {key: 'recent', label: t.home.filters.recent},
    {key: 'frequent', label: t.home.filters.frequent},
    {key: 'reco', label: t.home.filters.reco},
    {key: 'discover', label: t.home.filters.discover},
  ];

  const [data, setData] = useState<HomeData>({
    recentAlbums: [],
    frequentAlbums: [],
    deezerRecoAlbums: [],
    discoverArtists: [],
    playlists: [],
    likedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const scrollRef = useRef<ScrollView>(null);
  const sectionYs = useRef<Partial<Record<FilterKey, number>>>({});

  const playlistVersion = usePlayerStore(s => s.playlistVersion);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const landscapePadding = useLandscapeSidebarPadding();
  const isLandscape = useIsLandscape();

  const navigation = useNavigation<any>();

  const load = useCallback(async () => {
    if (isOfflineMode) { setLoading(false); return; }
    try {
      const [recent, frequent, starred, playlists] = await Promise.all([
        getRecentAlbums(8),
        getFrequentAlbums(8),
        getStarred(),
        getPlaylists().catch(() => [] as SubsonicPlaylist[]),
      ]);

      const seedArtistIds = frequent.slice(0, 3).map(a => a.artistId).filter(Boolean);
      const recentArtistNames = [...new Set(recent.map(a => a.artist).filter(Boolean))].slice(0, 4);

      // Discover artists (Subsonic) + Deezer reco albums — run in parallel
      const [artistArrays, deezerRawArrays] = await Promise.all([
        Promise.all(seedArtistIds.map(id => getSimilarArtists(id, 8).catch(() => []))),
        Promise.all(recentArtistNames.map(async name => {
          const id = await getDeezerArtistId(name).catch(() => null);
          if (!id) return [] as DeezerTrack[];
          return getDeezerArtistTopTracks(id, 8).catch(() => [] as DeezerTrack[]);
        })),
      ]);

      const seenArtists = new Set<string>();
      const rawDiscover = artistArrays
        .flat()
        .filter(a => {
          if (a.present || seenArtists.has(a.id)) return false;
          seenArtists.add(a.id);
          return true;
        })
        .slice(0, 12);

      const deezerFlat = homeDedupeById(deezerRawArrays.flat()).slice(0, 25);

      // Fetch discover images + enrich Deezer tracks — in parallel
      const [discoverArtists, deezerEnriched] = await Promise.all([
        Promise.all(rawDiscover.map(async a => ({
          ...a,
          artistImageUrl: (await getArtistImage(a.name)) ?? undefined,
        }))),
        enrichTracksWithAlbumType(deezerFlat),
      ]);

      const deezerRecoAlbums = homeDedupeAlbums(
        deezerEnriched.filter(tr => !tr.isSingle),
      ).slice(0, 10);

      const recentIdSet = new Set(recent.map(a => a.id));
      const filteredFrequent = frequent.filter(a => !recentIdSet.has(a.id));

      setData({
        recentAlbums: recent,
        frequentAlbums: filteredFrequent,
        deezerRecoAlbums,
        discoverArtists,
        playlists,
        likedCount: starred.songs.length,
      });
      setError(false);
    } catch (e) {
      console.warn('Home load error', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOfflineMode]);

  useEffect(() => {
    load();
  }, [load, playlistVersion, isOfflineMode]);

  // ─── Auto-recovery when connectivity is restored ──────────────────────────
  const isOffline = useNetworkStore(s => s.isOffline);
  const prevOfflineRef = useRef(isOffline);
  const errorRef = useRef(error);
  errorRef.current = error;

  useEffect(() => {
    const wasOffline = prevOfflineRef.current;
    prevOfflineRef.current = isOffline;
    if (wasOffline && !isOffline && errorRef.current) {
      setError(false);
      setLoading(true);
      load();
    }
  }, [isOffline, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleFilter = (key: string) => {
    setActiveFilter(key as FilterKey);
    if (key === 'all') {
      scrollRef.current?.scrollTo({y: 0, animated: true});
    } else if (sectionYs.current[key as FilterKey] !== undefined) {
      scrollRef.current?.scrollTo({y: sectionYs.current[key as FilterKey]!, animated: true});
    }
  };

  type QuickItem = {
    id: string;
    name: string;
    coverArt?: string;
    accent?: string;
    isLiked: boolean;
    kind: 'liked' | 'playlist' | 'album';
  };

  const likedItem: QuickItem = {
    id: 'liked',
    name: t.home.likedSongs,
    coverArt: undefined,
    accent: '#5038A0',
    isLiked: true,
    kind: 'liked',
  };
  const playlistItems: QuickItem[] = data.playlists.slice(0, 5).map(p => ({
    id: p.id,
    name: p.name,
    coverArt: p.coverArt,
    accent: undefined,
    isLiked: false,
    kind: 'playlist',
  }));
  const albumFill: QuickItem[] = data.recentAlbums
    .slice(0, Math.max(0, 5 - playlistItems.length))
    .map(a => ({
      id: a.id,
      name: a.name,
      coverArt: a.coverArt,
      accent: undefined,
      isLiked: false,
      kind: 'album' as const,
    }));
  const quickItems = [likedItem, ...playlistItems, ...albumFill].slice(0, 6);

  const handleQuickPress = useCallback(
    (item: QuickItem) => {
      if (item.kind === 'playlist') {
        navigation.navigate('PlaylistDetail', {playlistId: item.id});
      } else if (item.kind === 'album') {
        navigation.navigate('AlbumDetail', {albumId: item.id});
      } else if (item.kind === 'liked') {
        navigation.navigate('LikedSongs');
      }
    },
    [navigation],
  );


  // Portrait: 3 rows of 2 tiles. Landscape: 2 rows of 3, leaving height for the carousels.
  const quickCols = isLandscape ? 3 : 2;
  const quickRows: typeof quickItems[] = [];
  for (let i = 0; i < Math.min(quickItems.length, 8); i += quickCols) {
    quickRows.push(quickItems.slice(i, i + quickCols));
  }

  return (
    <SafeAreaView style={[styles.root, landscapePadding]} edges={isFullscreenMode ? [] : ['top']}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />

      <GlobalHeader
        variant="home"
        filters={filters}
        activeFilter={activeFilter}
        onFilterPress={handleFilter}
      />

      {/* Scrollable content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={darkTheme.accent}
          />
        }>

        {/* Offline state */}
        {isOfflineMode && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{t.home.offlineEmptyState}</Text>
          </View>
        )}

        {/* Error state */}
        {!loading && !isOfflineMode && error && data.recentAlbums.length === 0 && (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{t.home.loadError}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setError(false); setLoading(true); load(); }}
              activeOpacity={0.7}>
              <Text style={styles.retryText}>{t.common.retry}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick access grid */}
        {!loading && !error && quickRows.length > 0 && (
          <View style={styles.quickGrid}>
            {quickRows.map((row, i) => (
              <View key={i} style={styles.quickRow}>
                {row.map(item => (
                  <QuickAccessCard
                    key={item.id}
                    name={item.name}
                    coverArt={item.coverArt}
                    accent={item.accent}
                    icon={
                      item.isLiked ? (
                        <HeartIcon size={26} color="#fff" filled />
                      ) : undefined
                    }
                    onPress={() => handleQuickPress(item)}
                  />
                ))}
                {row.length === 1 && <View style={styles.spacer} />}
              </View>
            ))}
          </View>
        )}

        {/* Recently played */}
        {!error && data.recentAlbums.length > 0 && (
          <View
            onLayout={e => {
              sectionYs.current.recent = e.nativeEvent.layout.y;
            }}>
            <SectionHeader title={t.home.sections.recentlyPlayed} />
            <FlatList
              horizontal
              data={data.recentAlbums}
              keyExtractor={a => a.id}
              renderItem={({item}) => (
                <AlbumCard
                  id={item.id}
                  name={item.name}
                  artist={item.artist}
                  coverArt={item.coverArt}
                  label={item.songCount === 1 ? t.home.typeSingle : t.home.typeAlbum}
                  onPress={() =>
                    item.songCount === 1
                      ? loadAndPlayAlbum(item.id)
                      : navigation.navigate('AlbumDetail', {albumId: item.id})
                  }
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Frequently played */}
        {!error && data.frequentAlbums.length > 0 && (
          <View
            onLayout={e => {
              sectionYs.current.frequent = e.nativeEvent.layout.y;
            }}>
            <SectionHeader title={t.home.sections.frequentlyPlayed} />
            <FlatList
              horizontal
              data={data.frequentAlbums}
              keyExtractor={a => a.id}
              renderItem={({item}) => (
                <AlbumCard
                  id={item.id}
                  name={item.name}
                  artist={item.artist}
                  coverArt={item.coverArt}
                  label={item.songCount === 1 ? t.home.typeSingle : t.home.typeAlbum}
                  onPress={() =>
                    item.songCount === 1
                      ? loadAndPlayAlbum(item.id)
                      : navigation.navigate('AlbumDetail', {albumId: item.id})
                  }
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Recommendations — Deezer album recs based on recent listens */}
        {!error && data.deezerRecoAlbums.length > 0 && (
          <View
            onLayout={e => {
              sectionYs.current.reco = e.nativeEvent.layout.y;
            }}>
            <SectionHeader title={t.home.sections.recommendations} />
            <FlatList
              horizontal
              data={data.deezerRecoAlbums}
              keyExtractor={item => `reco-${item.id}`}
              renderItem={({item}) => (
                <AlbumCard
                  id={String(item.id)}
                  name={item.album.title}
                  artist={item.artist.name}
                  imageUrl={item.album.cover_medium}
                  label={t.home.typeAlbum}
                  onPress={() =>
                    navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${item.album.id}`})
                  }
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Discover */}
        {!error && data.discoverArtists.length > 0 && (
          <View
            onLayout={e => {
              sectionYs.current.discover = e.nativeEvent.layout.y;
            }}>
            <SectionHeader title={t.home.sections.discover} />
            <FlatList
              horizontal
              data={data.discoverArtists}
              keyExtractor={a => a.id}
              renderItem={({item}) => (
                <ArtistCard
                  id={item.id}
                  name={item.name}
                  coverArt={item.coverArt}
                  imageUrl={item.artistImageUrl}
                  onPress={() => navigation.navigate('ArtistDetail', {artistId: item.id})}
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        <View style={{height: dockInset}} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  spacer: {flex: 1},
  root: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  quickGrid: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hList: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  errorText: {
    color: '#E84040',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#282828',
    borderWidth: 1,
    borderColor: '#444',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
