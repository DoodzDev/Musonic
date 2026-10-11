/**
 * @file SearchHome.tsx
 * @description Search landing screen. Shows the search bar and three Deezer-powered
 *   recommendation sections: based on liked songs, based on recent listens, and
 *   based on similar artists from the user's top liked artist.
 *   Recommendations are streamed via OctoFiesta using Deezer IDs as Subsonic IDs.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Svg, {Circle, Path} from 'react-native-svg';
import {darkTheme} from '../../theme';
import GlobalHeader from '../../components/GlobalHeader';
import AlbumCard from '../../components/AlbumCard';
import SectionHeader from '../../components/SectionHeader';
import {useT} from '../../i18n';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {getStarred, getRecentAlbums} from '../../api/endpoints/library';
import {getStreamUrl, getCoverArtUrl} from '../../api/client';
import {loadAndPlayTracks} from '../../services/playerActions';
import type {Track} from '../../store/playerStore';
import {
  getDeezerArtistId,
  getDeezerArtistTopTracks,
  enrichTracksWithAlbumType,
  type DeezerTrack,
} from '../../api/deezer';
import {useDockInset} from '../../navigation/dockLayout';

// ─── Search icon ──────────────────────────────────────────────────────────────

function SearchIconDark({size = 24, color = '#121212'}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={2.5} fill="none" />
      <Path d="M15.5 15.5 L21 21" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a Deezer track into the app's internal Track type.
 * OctoFiesta exposes Deezer songs as `ext-deezer-song-{id}` in Subsonic.
 * coverArt = songId (OctoFiesta serves the cover via the track ID, not album ID).
 * artwork uses Deezer CDN as fallback for RNTP lock screen.
 */
function deezerTrackToTrack(t: DeezerTrack): Track {
  const sid = `ext-deezer-song-${t.id}`;
  return {
    id: sid,
    title: t.title,
    artist: t.artist.name,
    album: t.album.title,
    duration: t.duration,
    coverArt: sid,
    streamUrl: getStreamUrl(sid),
    url: getStreamUrl(sid),
    artwork: getCoverArtUrl(sid, 300),
    artistId: undefined,
  };
}

function dedupeById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/**
 * For album tracks: keep only one representative per album.id.
 * Singles are always kept as-is (unique by track ID already handled by dedupeById).
 */
function dedupeAlbums(tracks: DeezerTrack[]): DeezerTrack[] {
  const seenAlbums = new Set<number>();
  return tracks.filter(t => {
    if (t.isSingle) return true;
    if (seenAlbums.has(t.album.id)) return false;
    seenAlbums.add(t.album.id);
    return true;
  });
}

function uniqueArtistNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter(n => {
    const key = n.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveArtistTracks(artistName: string, limit = 10): Promise<DeezerTrack[]> {
  const id = await getDeezerArtistId(artistName);
  if (!id) return [];
  return getDeezerArtistTopTracks(id, limit);
}

// ─── State type ───────────────────────────────────────────────────────────────

type SameStyleSection = {
  artistName: string;
  albums: DeezerTrack[];  // navigate to AlbumDetail on tap
  tracks: DeezerTrack[];  // play directly on tap
};

type RecoState = {
  likedAlbums: DeezerTrack[];
  likedTracks: DeezerTrack[];
  recentTracks: DeezerTrack[];
  sameStyleSections: SameStyleSection[];
};

const EMPTY_RECO: RecoState = {
  likedAlbums: [],
  likedTracks: [],
  recentTracks: [],
  sameStyleSections: [],
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchHome() {
  const dockInset = useDockInset();
  const t = useT();
  const navigation = useNavigation<any>();
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  const landscapePadding = useLandscapeSidebarPadding();
  const isLandscape = useIsLandscape();

  const [reco, setReco] = useState<RecoState>(EMPTY_RECO);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadRecos = useCallback(async () => {
    if (isOfflineMode) { setReco(EMPTY_RECO); setLoading(false); return; }
    setLoading(true);
    try {
      const [starred, recentAlbums] = await Promise.all([
        getStarred().catch(() => ({songs: [], albums: [], artists: []})),
        getRecentAlbums(8).catch(() => []),
      ]);

      // ── Seeds ──────────────────────────────────────────────────────────────
      const likedArtistNames = uniqueArtistNames(
        starred.songs.map(s => s.artist).filter(Boolean),
      ).slice(0, 6);

      // Recent artists — no overlap filter (keep all for "based on recent" section)
      const recentArtistNames = uniqueArtistNames(
        recentAlbums.map(a => a.artist).filter(Boolean),
      ).slice(0, 4);

      // Same style seeds: recent first, fill with liked if < 3
      const recentNamesLower = recentArtistNames.map(n => n.toLowerCase());
      const sameStyleSeeds = [
        ...recentArtistNames,
        ...likedArtistNames.filter(n => !recentNamesLower.includes(n.toLowerCase())),
      ].slice(0, 3);

      // ── "Same style" helper — seed artist's own top tracks ────────────────
      const fetchSameStyleRaw = async (name: string): Promise<DeezerTrack[]> => {
        const id = await getDeezerArtistId(name).catch(() => null);
        if (!id) return [];
        return getDeezerArtistTopTracks(id, 25).catch(() => []);
      };

      // ── Fetch everything in parallel ───────────────────────────────────────
      const [likedRawArrays, recentRawArrays, ss0Raw, ss1Raw, ss2Raw] = await Promise.all([
        Promise.all(likedArtistNames.map(n => resolveArtistTracks(n, 12).catch(() => []))),
        Promise.all(recentArtistNames.map(n => resolveArtistTracks(n, 12).catch(() => []))),
        sameStyleSeeds[0] ? fetchSameStyleRaw(sameStyleSeeds[0]) : Promise.resolve<DeezerTrack[]>([]),
        sameStyleSeeds[1] ? fetchSameStyleRaw(sameStyleSeeds[1]) : Promise.resolve<DeezerTrack[]>([]),
        sameStyleSeeds[2] ? fetchSameStyleRaw(sameStyleSeeds[2]) : Promise.resolve<DeezerTrack[]>([]),
      ]);

      const likedFlat = dedupeById(likedRawArrays.flat()).slice(0, 40);
      const recentFlat = dedupeById(recentRawArrays.flat()).slice(0, 30);

      // ── Batch-enrich all tracks with Single/Album type ─────────────────────
      const allRaw = [...likedFlat, ...recentFlat, ...ss0Raw, ...ss1Raw, ...ss2Raw];
      const allEnriched = await enrichTracksWithAlbumType(allRaw);

      let offset = 0;
      const likedEnriched = allEnriched.slice(offset, offset + likedFlat.length); offset += likedFlat.length;
      const recentEnriched = allEnriched.slice(offset, offset + recentFlat.length); offset += recentFlat.length;
      const ss0Enriched = allEnriched.slice(offset, offset + ss0Raw.length); offset += ss0Raw.length;
      const ss1Enriched = allEnriched.slice(offset, offset + ss1Raw.length); offset += ss1Raw.length;
      const ss2Enriched = allEnriched.slice(offset, offset + ss2Raw.length);

      // ── Build sections ─────────────────────────────────────────────────────
      const likedAlbums = dedupeAlbums(likedEnriched.filter(tr => !tr.isSingle)).slice(0, 10);
      // Show all liked tracks (not just singles) so users can play any of them directly
      const likedTracks = likedEnriched.slice(0, 20);
      const recentTracks = dedupeAlbums(recentEnriched).slice(0, 15);

      const buildSameStyleSection = (name: string, enriched: DeezerTrack[]): SameStyleSection => ({
        artistName: name,
        albums: dedupeAlbums(enriched.filter(tr => !tr.isSingle)).slice(0, 4),
        tracks: enriched.slice(0, 6),
      });

      const sameStyleSections: SameStyleSection[] = [
        sameStyleSeeds[0] ? buildSameStyleSection(sameStyleSeeds[0], ss0Enriched) : null,
        sameStyleSeeds[1] ? buildSameStyleSection(sameStyleSeeds[1], ss1Enriched) : null,
        sameStyleSeeds[2] ? buildSameStyleSection(sameStyleSeeds[2], ss2Enriched) : null,
      ].filter((s): s is SameStyleSection => s !== null && (s.albums.length > 0 || s.tracks.length > 0));

      if (!mountedRef.current) return;
      setReco({likedAlbums, likedTracks, recentTracks, sameStyleSections});
    } catch {
      // Non-critical — recommendations fail silently
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [isOfflineMode]);

  useEffect(() => {
    loadRecos();
  }, [loadRecos, isOfflineMode]);

  // ── Tap handler — Single → play, Album → AlbumDetail ────────────────────────
  const handleTrackPress = useCallback(
    (track: DeezerTrack) => {
      if (track.isSingle) {
        loadAndPlayTracks([deezerTrackToTrack(track)], 0);
      } else {
        navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${track.album.id}`});
      }
    },
    [navigation],
  );

  // ── Direct play — always plays regardless of isSingle ────────────────────────
  const handleTrackPlay = useCallback(
    (track: DeezerTrack) => {
      loadAndPlayTracks([deezerTrackToTrack(track)], 0);
    },
    [],
  );

  const hasAnyReco =
    reco.likedAlbums.length > 0 ||
    reco.likedTracks.length > 0 ||
    reco.recentTracks.length > 0 ||
    reco.sameStyleSections.length > 0;

  const searchBar = (
    <TouchableOpacity
      style={styles.fakeSearchBar}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('SearchActive')}>
      <SearchIconDark size={24} />
      <Text style={styles.fakeInputText}>{t.search.placeholder}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.root, landscapePadding]} edges={isFullscreenMode ? [] : ['top']}>
      <StatusBar barStyle="light-content" backgroundColor={darkTheme.background} />
      <GlobalHeader
        variant="simple"
        title={t.search.headerTitle}
        landscapeInlineExtra={<View style={styles.landscapeSearchBarWrap}>{searchBar}</View>}
      />

      {/* Search bar — its own row in portrait; inline in the header above in landscape */}
      {!isLandscape && (
        <View style={styles.searchContainer}>
          {searchBar}
        </View>
      )}

      {/* Recommendation sections */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, {paddingBottom: dockInset}]}>

        <Text style={styles.discoverTitle}>{t.search.discover.sectionTitle}</Text>

        {isOfflineMode && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{t.search.offlineEmptyState}</Text>
          </View>
        )}

        {!isOfflineMode && loading && (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={darkTheme.accent} size="small" />
            <Text style={styles.loaderText}>{t.search.discover.loading}</Text>
          </View>
        )}

        {!isOfflineMode && !loading && !hasAnyReco && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{t.search.discover.empty}</Text>
          </View>
        )}

        {/* Albums basés sur vos titres likés */}
        {!loading && reco.likedAlbums.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t.search.discover.albumsBasedOnLikes} />
            <FlatList
              horizontal
              data={reco.likedAlbums}
              keyExtractor={item => `liked-alb-${item.id}`}
              renderItem={({item}) => (
                <AlbumCard
                  id={String(item.id)}
                  name={item.album.title}
                  artist={item.artist.name}
                  imageUrl={item.album.cover_medium}
                  label={t.home.typeAlbum}
                  onPress={() => handleTrackPress(item)}
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Titres basés sur vos titres likés */}
        {!loading && reco.likedTracks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t.search.discover.tracksBasedOnLikes} />
            <FlatList
              horizontal
              data={reco.likedTracks}
              keyExtractor={item => `liked-trk-${item.id}`}
              renderItem={({item}) => (
                <AlbumCard
                  id={String(item.id)}
                  name={item.title}
                  artist={item.artist.name}
                  imageUrl={item.album.cover_medium}
                  label={t.search.trackType}
                  onPress={() => handleTrackPlay(item)}
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Basés sur vos écoutes récentes */}
        {!loading && reco.recentTracks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t.search.discover.basedOnRecent} />
            <FlatList
              horizontal
              data={reco.recentTracks}
              keyExtractor={item => `recent-${item.id}`}
              renderItem={({item}) => (
                <AlbumCard
                  id={String(item.id)}
                  name={item.isSingle ? item.title : item.album.title}
                  artist={item.artist.name}
                  imageUrl={item.album.cover_medium}
                  label={item.isSingle ? t.home.typeSingle : t.home.typeAlbum}
                  onPress={() => handleTrackPress(item)}
                />
              )}
              contentContainerStyle={styles.hList}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Dans le même style que… — sections groupées */}
        {!loading && reco.sameStyleSections.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={t.search.discover.sameStyleTitle} />
            {reco.sameStyleSections.map((section, idx) => (
              <View key={`style-${idx}`} style={styles.sameStyleBlock}>
                <Text style={styles.sameStyleArtistLabel}>{section.artistName}</Text>
                <FlatList
                  horizontal
                  data={[
                    ...section.albums.map(track => ({track, asAlbum: true})),
                    ...section.tracks.map(track => ({track, asAlbum: false})),
                  ]}
                  keyExtractor={item => `s${idx}-${item.asAlbum ? 'a' : 't'}-${item.track.id}`}
                  renderItem={({item}) => (
                    <AlbumCard
                      id={String(item.track.id)}
                      name={item.asAlbum ? item.track.album.title : item.track.title}
                      artist={item.track.artist.name}
                      imageUrl={item.track.album.cover_medium}
                      label={item.asAlbum ? t.home.typeAlbum : t.search.trackType}
                      onPress={() => {
                        if (item.asAlbum) {
                          navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${item.track.album.id}`});
                        } else {
                          loadAndPlayTracks([deezerTrackToTrack(item.track)], 0);
                        }
                      }}
                    />
                  )}
                  contentContainerStyle={styles.hList}
                  showsHorizontalScrollIndicator={false}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: darkTheme.background},
  searchContainer: {paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8},
  landscapeSearchBarWrap: {marginLeft: 16, marginRight: 16},
  fakeSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    height: 48,
    borderRadius: 6,
    paddingHorizontal: 14,
  },
  fakeInputText: {color: '#555', fontSize: 16, fontWeight: '600', marginLeft: 12},
  scroll: {flex: 1},
  scrollContent: {paddingBottom: 16},
  discoverTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 16,
    marginBottom: 4,
    marginTop: 8,
  },
  section: {marginBottom: 8},
  sameStyleBlock: {marginBottom: 16},
  sameStyleArtistLabel: {fontSize: 15, fontWeight: '700', color: '#b3b3b3', paddingHorizontal: 16, paddingBottom: 6},
  hList: {paddingHorizontal: 16, paddingBottom: 4},
  loaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 10,
  },
  loaderText: {color: '#888', fontSize: 14},
  emptyWrap: {paddingHorizontal: 16, paddingVertical: 32},
  emptyText: {color: '#666', fontSize: 14, textAlign: 'center'},
  bottomPad: {height: 180},
});
