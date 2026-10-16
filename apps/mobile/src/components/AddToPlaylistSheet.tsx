/**
 * @file AddToPlaylistSheet.tsx
 * @description Bottom sheet for adding one or more tracks to existing playlists
 *   or creating a new one. Updates the playlist membership cache on success.
 * @author DoodzProg
 * @version 1.0.5
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing, runOnJS} from 'react-native-reanimated';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import CoverArt from './CoverArt';
import Toast from './Toast';
import {usePlayerStore} from '../store/playerStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {useT, getT} from '../i18n';
import {
  getPlaylists,
  getPlaylist,
  updatePlaylist,
  createPlaylist,
} from '../api/endpoints/playlists';
import {getStreamUrl, subsonicGet} from '../api/client';
import CreatePlaylistModal from './CreatePlaylistModal';
import type {SubsonicPlaylist} from '../api/types';
import {CheckCircleGreenIcon, PlusCircleIcon, PlusIcon, SearchIcon} from './icons';

const SHEET_HEIGHT_RATIO = 0.91;

type PlaylistItem = SubsonicPlaylist & {
  containsTrack: boolean;
  trackIndex: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  trackId?: string;
  trackIds?: string[];
  trackTitle?: string;
  onToast: (message: string) => void;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Row ──────────────────────────────────────────────────────────────────────

function PlaylistRow({
  item,
  onToggle,
}: {
  item: PlaylistItem;
  onToggle: (item: PlaylistItem) => void;
}) {
  const t = useT();
  return (
    <TouchableOpacity accessibilityRole="button"
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onToggle(item)}>
      <CoverArt id={item.coverArt} size={50} borderRadius={4} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowSub}>
          {t.addToPlaylist.trackCount(item.songCount)}
        </Text>
      </View>
      {item.containsTrack ? <CheckCircleGreenIcon size={26} /> : <PlusCircleIcon size={26} color="#B3B3B3" />}
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AddToPlaylistSheet({
  visible,
  onClose,
  trackId,
  trackIds,
  trackTitle,
  onToast,
}: Props) {
  const t = useT();
  // Measured on every render so the sheet height follows rotation.
  const sheetHeight = useWindowDimensions().height * SHEET_HEIGHT_RATIO;
  const translateY = useSharedValue(sheetHeight);
  const overlayOpacity = useSharedValue(0);
  const [search, setSearch] = useState('');
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [localToastMsg, setLocalToastMsg] = useState('');
  const [localToastVisible, setLocalToastVisible] = useState(false);
  const localToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLocalToast = useCallback((msg: string) => {
    if (localToastTimer.current) clearTimeout(localToastTimer.current);
    setLocalToastMsg(msg);
    setLocalToastVisible(true);
    localToastTimer.current = setTimeout(() => setLocalToastVisible(false), 3500);
  }, []);

  const bumpPlaylistVersion = usePlayerStore(s => s.bumpPlaylistVersion);
  const setPlaylistSong = usePlayerStore(s => s.setPlaylistSong);
  const cacheAdd = usePlaylistCacheStore(s => s.addTracks);
  const cacheRemove = usePlaylistCacheStore(s => s.removeTrack);

  const isMultiMode = !!(trackIds?.length);

  const loadPlaylists = useCallback(async () => {
    if (!trackId && !isMultiMode) return;
    setLoading(true);
    try {
      const raw = await getPlaylists();
      if (isMultiMode) {
        setPlaylists(raw.map(p => ({...p, containsTrack: false, trackIndex: -1})));
      } else {
        const items = await Promise.all(
          raw.map(async p => {
            try {
              const {songs} = await getPlaylist(p.id);
              const idx = songs.findIndex(s => String(s.id) === String(trackId));
              return {...p, containsTrack: idx !== -1, trackIndex: idx} as PlaylistItem;
            } catch {
              return {...p, containsTrack: false, trackIndex: -1} as PlaylistItem;
            }
          }),
        );
        setPlaylists(items);
      }
    } catch (e) {
      console.warn('[AddToPlaylistSheet] load error', e);
    } finally {
      setLoading(false);
    }
  }, [trackId, isMultiMode]);

  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: translateY.value}]}));
  const overlayStyle = useAnimatedStyle(() => ({opacity: overlayOpacity.value}));

  const handleGesture = Gesture.Pan()
    .onUpdate(e => {
      'worklet';
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      'worklet';
      if (e.translationY > 50 || e.velocityY > 300) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, {damping: 20, stiffness: 200});
      }
    });

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {duration: 320, easing: Easing.out(Easing.cubic)});
      overlayOpacity.value = withTiming(0.78, {duration: 200});
      loadPlaylists();
    } else {
      translateY.value = withTiming(sheetHeight, {duration: 260, easing: Easing.in(Easing.cubic)});
      overlayOpacity.value = withTiming(0, {duration: 180});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loadPlaylists, sheetHeight]);

  const handleToggle = useCallback(
    async (item: PlaylistItem) => {
      if (!trackId) return;

      if (item.containsTrack) {
        // Optimistic remove
        setPlaylists(prev =>
          prev.map(p =>
            p.id === item.id
              ? {
                  ...p,
                  containsTrack: false,
                  trackIndex: -1,
                  songCount: Math.max(0, p.songCount - 1),
                }
              : p,
          ),
        );
        onToast(getT().addToPlaylist.removedFrom(item.name));
        try {
          if (item.trackIndex >= 0) {
            await updatePlaylist(item.id, undefined, undefined, [item.trackIndex]);
            bumpPlaylistVersion();
            const stillInAny = playlists.some(
              p => p.id !== item.id && p.containsTrack,
            );
            if (trackId) {
              setPlaylistSong(trackId, stillInAny);
              if (!stillInAny) cacheRemove(trackId);
            }
          }
        } catch (e) {
          // Revert
          setPlaylists(prev =>
            prev.map(p =>
              p.id === item.id
                ? {
                    ...p,
                    containsTrack: true,
                    trackIndex: item.trackIndex,
                    songCount: p.songCount + 1,
                  }
                : p,
            ),
          );
          onToast(getT().addToPlaylist.unavailableTrack);
          console.warn('[AddToPlaylistSheet] remove error:', e instanceof Error ? e.message : String(e));
        }
      } else if (trackId.startsWith('ext-')) {
        // Ext track: no optimistic update — wait for full success before touching state
        showLocalToast(getT().likes.sendingToServer);

        // Consume some bytes so OctoFiesta opens the connection and triggers download
        fetch(getStreamUrl(trackId), {headers: {Range: 'bytes=0-8192'}})
          .then(res => res.arrayBuffer())
          .catch(() => {});

        // Poll search3.view every 3s for up to 75s (covers download + 30s Navidrome scan debounce)
        let navidromeId: string | null = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          await new Promise<void>(r => setTimeout(r, 3000));
          if (attempt === 10) {
            showLocalToast(getT().likes.stillImporting);
          }
          try {
            const res = await subsonicGet<any>('search3.view', {
              query: trackTitle ?? '',
              songCount: 10,
              albumCount: 0,
              artistCount: 0,
            });
            const songs: any[] = res.searchResult3?.song ?? [];
            const match = songs.find(
              s => !String(s.id).startsWith('ext-') && s.title === trackTitle,
            );
            if (match) { navidromeId = String(match.id); break; }
          } catch { /* keep polling */ }
        }

        if (!navidromeId) {
          showLocalToast(getT().likes.sendError);
          return;
        }

        try {
          await updatePlaylist(item.id, undefined, [navidromeId]);
          bumpPlaylistVersion();
          // Update state only after confirmed server success
          const newIdx = item.songCount;
          setPlaylists(prev =>
            prev.map(p =>
              p.id === item.id
                ? {...p, containsTrack: true, trackIndex: newIdx, songCount: p.songCount + 1}
                : p,
            ),
          );
          setPlaylistSong(trackId, true);
          cacheAdd([trackId]);
          showLocalToast(getT().addToPlaylist.addedTo(trackTitle ?? '', item.name));
        } catch {
          showLocalToast(getT().addToPlaylist.unavailableTrack);
        }
      } else {
        // Optimistic add — track will be appended at current songCount index
        const newIdx = item.songCount;
        setPlaylists(prev =>
          prev.map(p =>
            p.id === item.id
              ? {
                  ...p,
                  containsTrack: true,
                  trackIndex: newIdx,
                  songCount: p.songCount + 1,
                }
              : p,
          ),
        );
        onToast(getT().addToPlaylist.addedTo(trackTitle ?? '', item.name));
        try {
          await updatePlaylist(item.id, undefined, [String(trackId)]);
          bumpPlaylistVersion();
          if (trackId) { setPlaylistSong(trackId, true); cacheAdd([trackId]); }
        } catch (e) {
          // Revert
          setPlaylists(prev =>
            prev.map(p =>
              p.id === item.id
                ? {
                    ...p,
                    containsTrack: false,
                    trackIndex: -1,
                    songCount: Math.max(0, p.songCount - 1),
                  }
                : p,
            ),
          );
          onToast(getT().addToPlaylist.unavailableTrack);
          console.warn('[AddToPlaylistSheet] add error:', e instanceof Error ? e.message : String(e));
        }
      }
    },
    [trackId, trackTitle, onToast, showLocalToast, bumpPlaylistVersion, setPlaylistSong, playlists, cacheAdd, cacheRemove],
  );

  const handleAddAllToPlaylist = useCallback(
    async (item: PlaylistItem) => {
      if (!trackIds?.length) return;
      onClose();
      try {
        await updatePlaylist(item.id, undefined, trackIds.map(String));
        bumpPlaylistVersion();
        cacheAdd(trackIds.map(String));
        onToast(getT().playlistOptions.addedAllToPlaylist(trackIds.length, item.name));
      } catch {
        onToast(getT().playlistOptions.addToPlaylistError);
      }
    },
    [trackIds, onClose, onToast, bumpPlaylistVersion, cacheAdd],
  );

  const handleCreate = useCallback(
    async (name: string) => {
      setCreateModalVisible(false);
      onClose();
      if (!trackId) return;
      try {
        await createPlaylist(name, [String(trackId)]);
        setPlaylistSong(trackId, true);
        cacheAdd([trackId]);
        onToast(getT().addToPlaylist.addedTo(trackTitle ?? '', name));
        bumpPlaylistVersion();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[AddToPlaylistSheet] create error:', msg);
      }
    },
    [trackId, trackTitle, onClose, onToast, setPlaylistSong, bumpPlaylistVersion, cacheAdd],
  );

  const filtered = search
    ? playlists.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : playlists;

  const active = filtered.filter(p => p.containsTrack);
  const others = filtered.filter(p => !p.containsTrack);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onClose}>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>

          {/* Overlay */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
            pointerEvents="none"
          />

          {/* Sheet */}
          <Animated.View style={[styles.sheet, {height: sheetHeight}, sheetStyle]}>

            {/* Handle */}
            <GestureDetector gesture={handleGesture}>
              <View style={styles.handleArea}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t.addToPlaylist.savedIn}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.newPlaylistBtn}>{t.addToPlaylist.newPlaylist}</Text>
            </TouchableOpacity>
          </View>

          {trackTitle ? (
            <Text style={styles.trackSub} numberOfLines={1}>
              {trackTitle}
            </Text>
          ) : null}

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator color="#1ED760" size="large" />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}>

              {/* Active playlists (contains track) */}
              {active.map(item => (
                <PlaylistRow key={item.id} item={item} onToggle={isMultiMode ? handleAddAllToPlaylist : handleToggle} />
              ))}

              {/* Divider between active and others */}
              {active.length > 0 && <View style={styles.divider} />}

              {/* Search + Sort */}
              <View style={styles.searchRow}>
                <View style={styles.searchPill}>
                  <SearchIcon size={16} color="#888" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t.addToPlaylist.searchPlaceholder}
                    placeholderTextColor="#666"
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
                <TouchableOpacity accessibilityRole="button" style={styles.sortBtn}>
                  <Text style={styles.sortText}>{t.addToPlaylist.sortButton}</Text>
                </TouchableOpacity>
              </View>

              {/* Other playlists */}
              {others.map(item => (
                <PlaylistRow key={item.id} item={item} onToggle={isMultiMode ? handleAddAllToPlaylist : handleToggle} />
              ))}

              {/* Footer: create new playlist */}
              <TouchableOpacity accessibilityRole="button"
                style={styles.footerRow}
                activeOpacity={0.7}
                onPress={() => setCreateModalVisible(true)}>
                <View style={styles.footerIcon}>
                  <PlusIcon size={22} />
                </View>
                <Text style={styles.footerText}>{t.addToPlaylist.newPlaylist}</Text>
              </TouchableOpacity>

            </ScrollView>
          )}
          </Animated.View>
          <Toast visible={localToastVisible} message={localToastMsg} />

        </GestureHandlerRootView>
      </Modal>

      <CreatePlaylistModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onCreate={handleCreate}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {backgroundColor: '#000'},
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#535353',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  newPlaylistBtn: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1ED760',
  },
  trackSub: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  divider: {
    height: 1,
    backgroundColor: '#282828',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  sortBtn: {
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sortText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rowName: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  rowSub: {
    color: '#B3B3B3',
    fontSize: 13,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  footerIcon: {
    width: 50,
    height: 50,
    backgroundColor: '#282828',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
});
