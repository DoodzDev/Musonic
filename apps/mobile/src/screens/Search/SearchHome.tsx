/**
 * @file SearchHome.tsx
 * @description Search landing screen (Design v2, R5.2). Large title with the
 *   account avatar, a search field that opens the live search, then the
 *   genres of the library to browse (each opens its page), then the
 *   Deezer-powered discovery shelves (shared Home cards): albums and tracks
 *   based on liked songs, based on recent listens, and "in the same style as"
 *   up to three artists. Recommendations are streamed via OctoFiesta using
 *   Deezer IDs as Subsonic IDs. Tapped tracks play alone, then autoplay
 *   (playback engine, ADR-009 A8).
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StatusBar, StyleSheet, View} from 'react-native';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import {LargeTitle, LargeTitleHeader, useLargeTitleInset, useLargeTitleScroll} from '../../components/ui/LargeTitleHeader';
import Text from '../../components/ui/Text';
import EmptyState from '../../components/ui/EmptyState';
import {SkeletonShelf} from '../../components/ui/Skeleton';
import SectionHeader from '../../components/ui/SectionHeader';
import PressableScale from '../../components/ui/PressableScale';
import ProfileButton from '../../components/shell/ProfileButton';
import {AlbumCard, HomeShelf} from '../../components/home/HomeCards';
import {SearchIcon} from '../../components/icons';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {getStarred, getRecentAlbums, getGenres, type SubsonicGenre} from '../../api/endpoints/library';
import {getStreamUrl, getCoverArtUrl} from '../../api/client';
import {playFromList} from '../../services/playback/launchers';
import type {Track} from '../../store/playerStore';
import {
  getDeezerArtistId,
  getDeezerArtistTopTracks,
  enrichTracksWithAlbumType,
  type DeezerTrack,
} from '../../api/deezer';
import {useDockInset} from '../../navigation/dockLayout';

/** Genres shown before "See all". */
const GENRES_SHOWN = 8;

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
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();

  const [reco, setReco] = useState<RecoState>(EMPTY_RECO);
  const [genres, setGenres] = useState<SubsonicGenre[]>([]);
  const [allGenres, setAllGenres] = useState(false);

  useEffect(() => {
    if (isOfflineMode) return;
    let cancelled = false;
    getGenres().then(g => { if (!cancelled) setGenres(g); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOfflineMode]);
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
        playFromList({type: 'search'}, [deezerTrackToTrack(track)], 0);
      } else {
        navigation.navigate('AlbumDetail', {albumId: `ext-deezer-album-${track.album.id}`});
      }
    },
    [navigation],
  );

  // ── Direct play — always plays regardless of isSingle ────────────────────────
  const handleTrackPlay = useCallback(
    (track: DeezerTrack) => {
      playFromList({type: 'search'}, [deezerTrackToTrack(track)], 0);
    },
    [],
  );

  const hasAnyReco =
    reco.likedAlbums.length > 0 ||
    reco.likedTracks.length > 0 ||
    reco.recentTracks.length > 0 ||
    reco.sameStyleSections.length > 0;

  const openSearch = () => navigation.navigate('SearchActive');
  const albumOf = (track: DeezerTrack) => `ext-deezer-album-${track.album.id}`;

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={isFullscreenMode} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingTop: top, paddingBottom: dockInset + spacing.m}}>
        <LargeTitle title={t.search.headerTitle} scrollY={scrollY} />

        <Pressable
          onPress={openSearch}
          accessibilityRole="search"
          accessibilityLabel={t.search.placeholder}
          android_ripple={{color: colors.fill}}
          style={styles.field}>
          <SearchIcon size={18} color={colors.textSecondary} />
          <Text variant="body" color="textSecondary" numberOfLines={1}>{t.search.placeholder}</Text>
        </Pressable>

        {!isOfflineMode && genres.length > 0 ? (
          <View style={styles.browse}>
            <SectionHeader
              title={t.search.browse}
              onSeeAll={genres.length > GENRES_SHOWN && !allGenres ? () => setAllGenres(true) : undefined}
            />
            <View style={styles.genres}>
              {(allGenres ? genres : genres.slice(0, GENRES_SHOWN)).map(g => (
                <PressableScale
                  key={g.value}
                  onPress={() => navigation.navigate('MixDetail', {genre: g.value, browse: true})}
                  accessibilityLabel={`${g.value}, ${t.allSongs.trackCount(g.songCount)}`}
                  style={styles.genre}>
                  <Text variant="headline" numberOfLines={1}>{g.value}</Text>
                  <Text variant="footnote" color="textSecondary">{t.allSongs.trackCount(g.songCount)}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        {isOfflineMode ? <EmptyState title={t.search.offlineEmptyState} /> : null}
        {!isOfflineMode && loading ? <><SkeletonShelf /><SkeletonShelf /></> : null}
        {!isOfflineMode && !loading && !hasAnyReco ? <EmptyState title={t.search.discover.empty} /> : null}

        {!loading ? (
          <>
            <HomeShelf
              title={t.search.discover.albumsBasedOnLikes}
              data={reco.likedAlbums}
              keyOf={item => `liked-alb-${item.id}`}
              renderItem={item => (
                <AlbumCard
                  name={item.album.title}
                  subtitle={`${t.home.typeAlbum} · ${item.artist.name}`}
                  coverUrl={item.album.cover_medium}
                  onPress={() => handleTrackPress(item)}
                />
              )}
            />
            <HomeShelf
              title={t.search.discover.tracksBasedOnLikes}
              data={reco.likedTracks}
              keyOf={item => `liked-trk-${item.id}`}
              renderItem={item => (
                <AlbumCard
                  name={item.title}
                  subtitle={`${t.search.trackType} · ${item.artist.name}`}
                  coverUrl={item.album.cover_medium}
                  onPress={() => handleTrackPlay(item)}
                />
              )}
            />
            <HomeShelf
              title={t.search.discover.basedOnRecent}
              data={reco.recentTracks}
              keyOf={item => `recent-${item.id}`}
              renderItem={item => (
                <AlbumCard
                  name={item.isSingle ? item.title : item.album.title}
                  subtitle={`${item.isSingle ? t.home.typeSingle : t.home.typeAlbum} · ${item.artist.name}`}
                  coverUrl={item.album.cover_medium}
                  onPress={() => handleTrackPress(item)}
                />
              )}
            />
            {reco.sameStyleSections.map(section => (
              <HomeShelf
                key={`style-${section.artistName}`}
                title={t.search.discover.sameStyle(section.artistName)}
                data={[
                  ...section.albums.map(track => ({track, asAlbum: true})),
                  ...section.tracks.map(track => ({track, asAlbum: false})),
                ]}
                keyOf={item => `${section.artistName}-${item.asAlbum ? 'a' : 't'}-${item.track.id}`}
                renderItem={item => (
                  <AlbumCard
                    name={item.asAlbum ? item.track.album.title : item.track.title}
                    subtitle={`${item.asAlbum ? t.home.typeAlbum : t.search.trackType} · ${item.track.artist.name}`}
                    coverUrl={item.track.album.cover_medium}
                    onPress={() => (item.asAlbum
                      ? navigation.navigate('AlbumDetail', {albumId: albumOf(item.track)})
                      : playFromList({type: 'search'}, [deezerTrackToTrack(item.track)], 0))}
                  />
                )}
              />
            ))}
          </>
        ) : null}
      </Animated.ScrollView>

      <LargeTitleHeader title={t.search.headerTitle} scrollY={scrollY} align="left" left={<ProfileButton />} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    // Same look as the shared SearchField.
    height: 40,
    marginHorizontal: spacing.gutter,
    marginBottom: spacing.s,
    paddingHorizontal: 10,
    borderRadius: radii.tile,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  browse: {paddingHorizontal: spacing.gutter, paddingBottom: spacing.l, gap: spacing.s},
  genres: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  genre: {
    // Two columns: half the row minus half the gap.
    width: '48.5%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.button,
    backgroundColor: colors.surface1,
    gap: 2,
  },
});
