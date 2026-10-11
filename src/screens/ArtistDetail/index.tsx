/**
 * @file index.tsx
 * @description Artist detail screen. Compact header (name left, framed photo
 *   right) used in both orientations — no full-bleed hero photo. Artist name
 *   fades into the top bar next to the back button once the header has
 *   scrolled out of view. Shows top songs (tap to play), and album discography
 *   fetched from the Subsonic API.
 * @author DoodzProg
 * @version 1.1.0
 * @license MIT
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import {useHeaderTopInset} from '../../hooks/useHeaderTopInset';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {darkTheme} from '../../theme';
import {subsonicGet, getStreamUrl, getCoverArtUrl} from '../../api/client';
import {
  getDeezerArtistId,
  getDeezerRelatedArtists,
  getDeezerArtistTopTracks,
  enrichTracksWithAlbumType,
  type DeezerTrack,
} from '../../api/deezer';
import {loadAndPlayTracks} from '../../services/playerActions';
import type {Track} from '../../store/playerStore';
import type {LibraryStackParams} from '../../navigation/types';
import AlbumCard from '../../components/AlbumCard';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import CoverArt from '../../components/CoverArt';
import {useT, getT} from '../../i18n';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';

function artDedupeById(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

function artDedupeAlbums(tracks: DeezerTrack[]): DeezerTrack[] {
  const seen = new Set<number>();
  return tracks.filter(t => {
    if (t.isSingle) return true;
    if (seen.has(t.album.id)) return false;
    seen.add(t.album.id);
    return true;
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────
type RouteT = RouteProp<LibraryStackParams, 'ArtistDetail'>;

export default function ArtistDetailScreen() {
  const dockInset = useDockInset();
  const t = useT();
  const topInset = useHeaderTopInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParams, 'ArtistDetail'>>();
  const route = useRoute<RouteT>();
  const {artistId: routeArtistId, artistName: routeArtistName} = route.params;

  const [artistName, setArtistName] = useState<string>(t.artistDetail.loading);
  const [artistImage, setArtistImage] = useState<string | null>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [topSongs, setTopSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [similarAlbums, setSimilarAlbums] = useState<DeezerTrack[]>([]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(140);

  // Compact title fades into the top bar once the name+photo header block
  // (measured via onLayout) has scrolled out of view, so there's always
  // something identifying the artist even once the header itself is gone.
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, headerHeight - 40), headerHeight],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const topBarBgOpacity = compactTitleOpacity;

  useEffect(() => {
    if (loading || !artistName || artistName === t.artistDetail.loading) return;
    async function loadSimilar() {
      try {
        const deezerId = await getDeezerArtistId(artistName);
        if (!deezerId) return;
        const related = await getDeezerRelatedArtists(deezerId, 6);
        const rawArrays = await Promise.all(
          related.map(ra => getDeezerArtistTopTracks(ra.id, 8).catch(() => [] as DeezerTrack[])),
        );
        const flat = artDedupeById(rawArrays.flat());
        const enriched = await enrichTracksWithAlbumType(flat);
        const simList = artDedupeAlbums(enriched.filter(tr => !tr.isSingle)).slice(0, 12);
        setSimilarAlbums(simList);
      } catch { /* silent */ }
    }
    loadSimilar();
  }, [loading, artistName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadArtistData() {
      try {
        let artistId = routeArtistId;
        if (!artistId && routeArtistName) {
          const res = await subsonicGet<any>('search3.view', {query: routeArtistName, artistCount: 1, albumCount: 0, songCount: 0});
          const d = res['subsonic-response'] || res;
          artistId = d.searchResult3?.artist?.[0]?.id;
        }
        if (!artistId) {
          setArtistName(routeArtistName || getT().artistDetail.unknownArtist);
          if (routeArtistName) {
            const r = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(routeArtistName)}`);
            const j = await r.json();
            if (j.data?.length > 0) setArtistImage(j.data[0].picture_xl);
          }
          setLoading(false);
          return;
        }
        const resArtist = await subsonicGet<any>('getArtist.view', { id: artistId });
        const data = resArtist['subsonic-response'] || resArtist;
        const artistData = data.artist || {};
        
        setArtistName(artistData.name || getT().artistDetail.unknownArtist);
        setAlbums(artistData.album || []);

        try {
          const resTop = await subsonicGet<any>('getTopSongs.view', { artist: artistData.name });
          const topData = resTop['subsonic-response'] || resTop;
          setTopSongs(topData.topSongs?.song || []);
        } catch { console.warn('getTopSongs not supported'); }

        if (artistData.name) {
          const resDeezer = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistData.name)}`);
          const jsonDeezer = await resDeezer.json();
          if (jsonDeezer.data && jsonDeezer.data.length > 0) {
            setArtistImage(jsonDeezer.data[0].picture_xl);
          }
        }
      } catch (error) {
        console.warn('ArtistDetail load error:', error);
      } finally {
        setLoading(false);
      }
    }
    loadArtistData();
  }, [routeArtistId, routeArtistName]);

  const topSongsToTracks = useCallback((): Track[] => topSongs.map((s: any) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    duration: s.duration || 0,
    coverArt: s.coverArt,
    streamUrl: getStreamUrl(s.id),
    url: getStreamUrl(s.id),
    artwork: getCoverArtUrl(s.coverArt || s.id, 300),
  })), [topSongs]);

  const handlePlayTopSongs = useCallback(async () => {
    if (!topSongs.length) return;
    await loadAndPlayTracks(topSongsToTracks(), 0);
  }, [topSongs, topSongsToTracks]);

  const handlePressTopSong = useCallback(async (index: number) => {
    if (!topSongs.length) return;
    await loadAndPlayTracks(topSongsToTracks(), index);
  }, [topSongs, topSongsToTracks]);

  // Same compact header (name left, framed photo right) in both orientations
  // — no more huge full-bleed photo to scroll past. It's normal scrolling
  // content (measured via onLayout), and the artist name fades into the top
  // bar next to the back button once the header has scrolled out of view.
  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={[styles.topBar, {paddingTop: topInset}]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.topBarBg, {opacity: topBarBgOpacity}]} pointerEvents="none" />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <View style={styles.backBtnBg}><BackArrowIcon size={24} /></View>
        </TouchableOpacity>
        <Animated.Text style={[styles.topBarTitle, {opacity: compactTitleOpacity}]} numberOfLines={1}>
          {artistName}
        </Animated.Text>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {useNativeDriver: true})}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, {paddingBottom: dockInset}]}
      >
        <View style={styles.headerBlock} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
          <Text style={styles.artistName} numberOfLines={2}>{artistName}</Text>
          <View style={styles.artistPhotoFrame}>
            {artistImage ? (
              <Image source={{uri: artistImage}} style={styles.artistPhoto} />
            ) : (
              <View style={[styles.artistPhoto, styles.coverPlaceholder]} />
            )}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={darkTheme.accent} style={styles.loader} />
        ) : (
          <View style={styles.content}>

            {topSongs.length > 0 && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.playBtn} onPress={handlePlayTopSongs}>
                  <PlayIcon size={24} />
                </TouchableOpacity>
              </View>
            )}

            {topSongs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.artistDetail.popularSongs}</Text>
                {topSongs.slice(0, 5).map((song, index) => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.songRow}
                    activeOpacity={0.7}
                    onPress={() => handlePressTopSong(index)}>
                    <Text style={styles.songIndex}>{index + 1}</Text>
                    <CoverArt id={song.coverArt} size={44} borderRadius={4} />
                    <View style={styles.songInfo}>
                      <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                      <Text style={styles.songArtist} numberOfLines={1}>{song.album}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {albums.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.artistDetail.popularReleases}</Text>
                <FlatList
                  horizontal
                  data={albums}
                  keyExtractor={a => a.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hList}
                  renderItem={({item}) => (
                    <AlbumCard
                      id={item.id}
                      name={item.name}
                      artist={item.artist}
                      coverArt={item.coverArt}
                      onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id })}
                    />
                  )}
                />
              </View>
            )}

            {similarAlbums.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.artistDetail.similarRecommendations}</Text>
                <FlatList
                  horizontal
                  data={similarAlbums}
                  keyExtractor={item => `sim-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hList}
                  renderItem={({item}) => (
                    <AlbumCard
                      id={String(item.id)}
                      name={item.album.title}
                      artist={item.artist.name}
                      imageUrl={item.album.cover_medium}
                      onPress={() => navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${item.album.id}`})}
                    />
                  )}
                />
              </View>
            )}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  coverPlaceholder: {backgroundColor: '#333'},
  scrollContent: {paddingBottom: 100},
  loader: {marginTop: 50},
  root: { flex: 1, backgroundColor: darkTheme.background },
  // Real (non-absolute) top bar — back button always visible, title fades in
  // once the header block below has scrolled past (see compactTitleOpacity).
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 12 },
  topBarBg: { backgroundColor: darkTheme.background },
  topBarTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff' },
  backBtn: { padding: 6 },
  backBtnBg: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 6 },
  // Header block — name left, framed photo right, both visible without
  // scrolling, in both orientations. Frame follows the nested-radius rule:
  // outer radius (16) = inner photo radius (12) + the frame's own padding (4).
  headerBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  artistName: { flex: 1, fontSize: 28, fontWeight: '900', color: '#fff' },
  artistPhotoFrame: {
    width: 108, height: 108, borderRadius: 16, padding: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  artistPhoto: { width: '100%', height: '100%', borderRadius: 12, resizeMode: 'cover' },
  content: { flex: 1, backgroundColor: darkTheme.background },
  actionRow: { paddingHorizontal: 16, marginBottom: 24, flexDirection: 'row', justifyContent: 'flex-end' },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: darkTheme.accent, alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#fff', paddingHorizontal: 16, marginBottom: 16 },
  hList: { paddingHorizontal: 16, gap: 16 },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 16, paddingVertical: 10, gap: 12 },
  songIndex: { width: 24, fontSize: 14, fontWeight: '600', color: '#888', textAlign: 'right' },
  songInfo: { flex: 1 },
  songTitle: { fontSize: 16, fontWeight: '500', color: '#fff' },
  songArtist: { fontSize: 13, color: '#aaa', marginTop: 2 },
});