/**
 * @file QueueSheet.tsx
 * @description Queue sheet of the full player (Design v2, R4.4). Header with
 *   the current track (tap: back to the player), three mode tiles (Shuffle,
 *   Repeat, Autoplay), the "Up next" list and, below it, the dimmed autoplay
 *   suggestions. Rows are reordered at any time by their handle; "Edit" only
 *   selects rows (no save step: changes apply at once), with a glass bar to
 *   play the selection next or remove it, or to clear everything (Undo in a
 *   toast). Rows are keyed by queue entry (a track present twice has two
 *   entries); moves go through the playback engine, across zones. The list
 *   keeps its own order and only takes the engine's when it really differs,
 *   so a drop is never followed by a second update mid-animation. The list is
 *   a reorderable list driven on the UI thread: while a row is dragged the
 *   list cannot scroll, and a swipe outside the handle only scrolls.
 *   Landscape: two columns, as in the player. The current track and the
 *   tiles stay on the cover's side, the list takes the full height of the
 *   other one.
 * @author DoodzProg
 * @version 3.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ReorderableList, {
  reorderItems,
  useIsActive,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import {useActiveTrack} from 'react-native-track-player';
import CoverArt from './CoverArt';
import GlassSurface from './ui/GlassSurface';
import PressableScale from './ui/PressableScale';
import {
  ChevronDownIcon,
  DragHandleIcon,
  InfinityIcon,
  RepeatIcon,
  SelectCircleIcon,
  ShuffleIcon,
  SparkleIcon,
} from './icons';
import {useT} from '../i18n';
import {usePlayerStore, type Track} from '../store/playerStore';
import {useSettingsStore} from '../store/settingsStore';
import {useIsLandscape} from '../hooks/useIsLandscape';
import {playbackEngine} from '../services/playback/engine';
import {haptic} from '../services/haptics';
import {colors, radii} from '../theme/tokens';
import {toast, ToastHost} from './ui/Toast';
import {DISMISS} from './ui/gestures';

const SHEET_HEIGHT_RATIO = 0.92;
const SHEET_BG = '#121214';
const HEADER_COVER = 64;
const ROW_COVER = 44;
/** Toast distance from the bottom: clears the glass action bar. */
const TOAST_BOTTOM = 110;
/** Room kept under the list so the last rows clear the glass action bar. */
const ACTION_BAR_SPACE = 96;
const TILE_OFF_BG = 'rgba(255,255,255,0.1)';
const TILE_OFF_FG = 'rgba(255,255,255,0.85)';

// ─── Rows ─────────────────────────────────────────────────────────────────────

/** Queue entry key (the engine sets one per entry). */
function rowKey(t: Track): string {
  return t.entryId ?? t.id;
}

/** Same rows, same order, same roles: nothing worth re-rendering. */
function sameRows(a: Track[], b: Track[]): boolean {
  return a.length === b.length && a.every((t, i) =>
    rowKey(t) === rowKey(b[i]) && !!t.isMagic === !!b[i].isMagic && !!t.isAutoplay === !!b[i].isAutoplay);
}

/** Row cover with the orange Magic disc when the track is a Magic suggestion. */
function RowCover({item, magicLabel}: {item: Track; magicLabel: string}) {
  return (
    <View style={styles.rowCover}>
      <CoverArt id={item.coverArt} size={ROW_COVER} borderRadius={radii.cover} />
      {item.isMagic && (
        <View style={styles.magicDisc} accessible accessibilityLabel={magicLabel}>
          <SparkleIcon size={10} color={colors.onAccent} />
        </View>
      )}
    </View>
  );
}

interface QueueRowProps {
  item: Track;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const QueueRow = React.memo(function QueueRow({item, isEditMode, isSelected, onSelect}: QueueRowProps) {
  const t = useT().queue;
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <Pressable
      style={[styles.row, isActive && styles.rowDragging]}
      onPress={isEditMode ? () => onSelect(rowKey(item)) : undefined}
      disabled={!isEditMode}
      // Always explicit values: Android keeps a label or role that merely becomes undefined.
      accessibilityRole={isEditMode ? 'checkbox' : 'text'}
      accessibilityState={isEditMode ? {checked: isSelected} : {}}
      accessibilityLabel={isEditMode
        ? (isSelected ? t.deselect(item.title) : t.select(item.title))
        : `${item.title}, ${item.artist}`}>
      {isEditMode && (
        <View style={styles.selectCircle}>
          <SelectCircleIcon selected={isSelected} />
        </View>
      )}
      <RowCover item={item} magicLabel={t.magicSuggestion} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
      <Pressable
        onPressIn={drag}
        hitSlop={{top: 9, bottom: 9, left: 4, right: 12}}
        style={styles.handle}
        accessibilityRole="button"
        accessibilityLabel={t.reorder(item.title)}>
        <DragHandleIcon />
      </Pressable>
    </Pressable>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.isEditMode === next.isEditMode &&
  prev.isSelected === next.isSelected &&
  prev.onSelect === next.onSelect,
);

/** Autoplay suggestion: not reorderable, dimmed (it plays only after the queue). */
function AutoplayRow({item, magicLabel}: {item: Track; magicLabel: string}) {
  return (
    <View style={[styles.row, styles.autoRow]}>
      <RowCover item={item} magicLabel={magicLabel} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
    </View>
  );
}

// ─── Mode tile ────────────────────────────────────────────────────────────────

/** Glyph and label colour of a mode tile. */
function tileFg(active: boolean): string {
  return active ? colors.accent : TILE_OFF_FG;
}

function ModeTile({label, active, busy, onPress, icon, withHaptic}: {
  label: string;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
  /** Shuffle and repeat vibrate in their store actions; only autoplay needs it here. */
  withHaptic?: boolean;
  /** Glyph drawn in `tileFg(active)`. */
  icon: React.ReactNode;
}) {
  const fg = tileFg(active);
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      haptic={withHaptic ? 'selection' : undefined}
      style={[styles.tile, {backgroundColor: active ? colors.accentFill : TILE_OFF_BG}]}
      accessibilityLabel={label}
      accessibilityState={{selected: active, busy}}>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : icon}
      <Text style={[styles.tileLabel, {color: fg}]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </PressableScale>
  );
}

// ─── QueueSheet ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  slideY: Animated.Value;
}

export default function QueueSheet({visible, onClose, slideY}: Props) {
  // Measured on every render so the sheet follows rotation.
  const {height: winH} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = winH * SHEET_HEIGHT_RATIO;
  const t = useT();
  const currentTrack = useActiveTrack();
  const storeUpcoming = usePlayerStore(s => s.upcoming);
  // The list's own order: set at once on a drop, then replaced by the
  // engine's only when that one really differs (next track, removal…).
  const [upcoming, setUpcoming] = useState<Track[]>(storeUpcoming);
  const pendingMoves = useRef(0);
  const syncFromStore = useCallback(() => {
    const latest = usePlayerStore.getState().upcoming;
    setUpcoming(prev => (sameRows(prev, latest) ? prev : latest));
  }, []);
  useEffect(() => {
    if (pendingMoves.current === 0) syncFromStore();
  }, [storeUpcoming, syncFromStore]);
  const currentPlaylistName = usePlayerStore(s => s.currentPlaylistName);
  const dominantColor = usePlayerStore(s => s.dominantColor);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const isFetchingMagic = usePlayerStore(s => s.isFetchingMagic);
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat);
  const reorderQueue = usePlayerStore(s => s.reorderQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const moveToTop = usePlayerStore(s => s.moveToTop);
  const isAutoplayEnabled = useSettingsStore(s => s.isAutoplayEnabled);
  const isLandscape = useIsLandscape();
  // Same side as the cover in the landscape player.
  const infoFirst = useSettingsStore(s => s.fullPlayerCoverSide) !== 'right';

  const upNext = useMemo(() => upcoming.filter(r => !r.isAutoplay), [upcoming]);
  const autoRows = useMemo(() => upcoming.filter(r => r.isAutoplay), [upcoming]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Swipe down to close. One gesture per detector (landscape has two: the handle and the info column).
  const makeCloseGesture = useCallback(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(10)
    .onEnd(e => {
      if (e.translationY > DISMISS.distance || e.velocityY > DISMISS.velocity) onClose();
    }), [onClose]);
  const headerGesture = useMemo(makeCloseGesture, [makeCloseGesture]);
  const handleGesture = useMemo(makeCloseGesture, [makeCloseGesture]);

  const exitEditMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      // No save step: the changes are already applied, "Done" just confirms it.
      haptic('success');
      exitEditMode();
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditMode(true);
  }, [isEditMode, exitEditMode]);

  const toggleSelect = useCallback((id: string) => {
    haptic('selection');
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePlayNext = useCallback(() => {
    if (selectedIds.size === 0) return;
    moveToTop([...selectedIds]);
    haptic('success');
    exitEditMode();
  }, [selectedIds, moveToTop, exitEditMode]);

  const handleRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    removeFromQueue([...selectedIds]);
    haptic('warning');
    exitEditMode();
  }, [selectedIds, removeFromQueue, exitEditMode]);

  const handleClearAll = useCallback(() => {
    playbackEngine.clearQueue();
    haptic('warning');
    exitEditMode();
    toast.show(t.queue.clearedToast, {
      kind: 'success',
      action: {label: t.queue.undo, onPress: () => playbackEngine.undoClearQueue()},
    });
  }, [exitEditMode, t]);

  // Moves by entry (the moved one and the one now after it), never by
  // position: fast successive drags can't target a stale row. A drop at the
  // end of "Up next" lands before the autoplay suggestions.
  const rowsRef = useRef(upNext);
  rowsRef.current = upNext;
  const autoRef = useRef(autoRows);
  autoRef.current = autoRows;
  const handleReorder = useCallback(({from, to}: ReorderableListReorderEvent) => {
    if (from === to) return;
    const data = reorderItems(rowsRef.current, from, to);
    const moved = data[to];
    if (!moved) return;
    const after = data[to + 1] ?? autoRef.current[0];
    rowsRef.current = data;
    setUpcoming([...data, ...autoRef.current]);
    pendingMoves.current++;
    reorderQueue(rowKey(moved), after ? rowKey(after) : null).finally(() => {
      pendingMoves.current--;
      if (pendingMoves.current === 0) syncFromStore();
    });
  }, [reorderQueue, syncFromStore]);

  useEffect(() => {
    if (!visible) exitEditMode();
  }, [visible, exitEditMode]);

  const renderItem = useCallback(
    ({item}: {item: Track}) => (
      <QueueRow
        item={item}
        isEditMode={isEditMode}
        isSelected={selectedIds.has(rowKey(item))}
        onSelect={toggleSelect}
      />
    ),
    [isEditMode, selectedIds, toggleSelect],
  );

  if (!visible || !currentTrack) return null;

  const hasSelection = selectedIds.size > 0;
  const shuffleNote = shuffleMode === 'magic' ? t.queue.shuffleMagic : shuffleMode === 'on' ? t.queue.shuffleOn : null;
  const subtitle = [t.queue.from(currentPlaylistName || t.queue.fallbackName), shuffleNote].filter(Boolean).join(' · ');

  const listHeader = (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionText}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t.queue.upNext}</Text>
        <Text style={styles.sectionSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {upNext.length > 0 && (
        <Pressable onPress={toggleEditMode} hitSlop={12} accessibilityRole="button">
          <Text style={styles.editText}>{isEditMode ? t.queue.done : t.queue.modifyButton}</Text>
        </Pressable>
      )}
    </View>
  );

  const listFooter = (
    <View style={{paddingBottom: isEditMode ? ACTION_BAR_SPACE : insets.bottom + 16}}>
      {upNext.length === 0 && <Text style={styles.empty}>{t.queue.empty}</Text>}
      {/* Repeat all starts the queue over: autoplay never comes, so the section would mislead (C8). */}
      {isAutoplayEnabled && repeatMode !== 'all' && (
        <>
          <View style={styles.autoHeader}>
            <InfinityIcon size={18} color={colors.accent} />
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{t.queue.autoplayTitle}</Text>
              <Text style={styles.sectionSubtitle} numberOfLines={1}>{t.queue.autoplaySubtitle}</Text>
            </View>
          </View>
          {autoRows.map(r => <AutoplayRow key={rowKey(r)} item={r} magicLabel={t.queue.magicSuggestion} />)}
        </>
      )}
    </View>
  );

  const currentNode = (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        style={styles.current}
        accessibilityRole="button"
        accessibilityLabel={`${t.queue.backToPlayer} : ${currentTrack.title}`}>
        <CoverArt id={currentTrack.coverArt} size={HEADER_COVER} borderRadius={radii.tile} />
        <View style={styles.rowInfo}>
          <Text style={styles.currentTitle} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={styles.currentArtist} numberOfLines={1}>{currentTrack.artist}</Text>
        </View>
      </Pressable>
      <PressableScale onPress={onClose} style={styles.closeBtn} accessibilityLabel={t.queue.close}>
        <ChevronDownIcon size={16} />
      </PressableScale>
    </View>
  );

  const tilesNode = (
    <View style={styles.tiles}>
      <ModeTile
        label={t.queue.shuffleTile}
        active={shuffleMode !== 'off'}
        busy={isFetchingMagic}
        onPress={toggleShuffle}
        icon={<ShuffleIcon mode={shuffleMode} color={tileFg(shuffleMode !== 'off')} size={18} indicator={false} />}
      />
      <ModeTile
        label={t.queue.repeatTile}
        active={repeatMode !== 'none'}
        onPress={cycleRepeat}
        icon={<RepeatIcon mode={repeatMode} color={tileFg(repeatMode !== 'none')} size={18} indicator={false} />}
      />
      <ModeTile
        label={t.queue.autoplayTile}
        active={isAutoplayEnabled}
        onPress={() => playbackEngine.setAutoplay(!isAutoplayEnabled)}
        withHaptic
        icon={<InfinityIcon size={18} color={tileFg(isAutoplayEnabled)} />}
      />
    </View>
  );

  // Up next (reorderable) + autoplay suggestions, with the selection actions floating over it.
  const listNode = (
    <View style={styles.fill}>
      <GestureHandlerRootView style={styles.fill}>
        <ReorderableList
          data={upNext}
          keyExtractor={rowKey}
          onReorder={handleReorder}
          shouldUpdateActiveItem
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
        />
      </GestureHandlerRootView>

      {isEditMode && (
        <GlassSurface radius={28} style={[styles.actionBar, {bottom: insets.bottom + 12}]}>
          {hasSelection ? (
            <>
              <PressableScale accessibilityRole="button" onPress={handlePlayNext} style={[styles.action, styles.actionNeutral]}>
                <Text style={styles.actionText}>{t.queue.playNext}</Text>
              </PressableScale>
              <PressableScale accessibilityRole="button" onPress={handleRemove} style={[styles.action, styles.actionDanger]}>
                <Text style={[styles.actionText, styles.actionDangerText]}>{t.queue.removeCount(selectedIds.size)}</Text>
              </PressableScale>
            </>
          ) : (
            <PressableScale accessibilityRole="button" onPress={handleClearAll} style={[styles.action, styles.actionDanger]}>
              <Text style={[styles.actionText, styles.actionDangerText]}>{t.queue.clearAll}</Text>
            </PressableScale>
          )}
        </GlassSurface>
      )}
    </View>
  );

  const infoColumn = (
    <GestureDetector gesture={headerGesture}>
      <View style={styles.landscapeInfo}>
        {currentNode}
        {tilesNode}
      </View>
    </GestureDetector>
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <TouchableWithoutFeedback accessibilityRole="button" accessibilityLabel={t.ui.close} onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, {height: sheetHeight, transform: [{translateY: slideY}]}]}>
        {/* A light wash of the cover colour from the top, as in the player. */}
        <LinearGradient
          colors={[`${dominantColor}B3`, `${dominantColor}00`]}
          locations={[0, 0.45]}
          style={[StyleSheet.absoluteFill, styles.wash]}
          pointerEvents="none"
        />
        {isLandscape ? (
          <View style={[styles.fill, {paddingLeft: insets.left, paddingRight: insets.right}]}>
            <GestureDetector gesture={handleGesture}>
              <View style={styles.pillZone}><View style={styles.pill} /></View>
            </GestureDetector>
            <View style={styles.landscapeBody}>
              {infoFirst && infoColumn}
              {listNode}
              {!infoFirst && infoColumn}
            </View>
          </View>
        ) : (
          <View style={styles.fill}>
            {/* ── Handle, current track and mode tiles: swipe down to close ── */}
            <GestureDetector gesture={headerGesture}>
              <View style={styles.top}>
                <View style={styles.pill} />
                {currentNode}
                {tilesNode}
              </View>
            </GestureDetector>
            {listNode}
          </View>
        )}
      </Animated.View>

      {/* The player is a Modal: toasts need their own host here, above the action bar. */}
      <ToastHost bottom={TOAST_BOTTOM} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {flex: 1},
  backdrop: {
    backgroundColor: colors.backdrop,
    zIndex: 200,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    overflow: 'hidden',
  },
  wash: {opacity: 0.6},
  top: {paddingHorizontal: 20},
  pillZone: {alignItems: 'center'},
  landscapeBody: {
    flex: 1,
    flexDirection: 'row',
  },
  /** Landscape: the current track and the tiles, on the cover's side. */
  landscapeInfo: {
    width: '40%',
    paddingHorizontal: 20,
    // Same top as the "Up next" title of the list (its header's paddingTop).
    paddingTop: 12,
  },
  pill: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  current: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currentTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  currentArtist: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    marginBottom: 6,
  },
  tile: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionText: {flex: 1, minWidth: 0},
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 1,
  },
  editText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 8,
    backgroundColor: 'transparent',
  },
  rowDragging: {backgroundColor: colors.surface2},
  autoRow: {opacity: 0.6, paddingRight: 20},
  selectCircle: {width: 24, height: 24},
  rowCover: {width: ROW_COVER, height: ROW_COVER},
  magicDisc: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: SHEET_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {flex: 1, minWidth: 0},
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    letterSpacing: -0.3,
  },
  rowArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 1,
  },
  handle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  autoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  actionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 56,
    flexDirection: 'row',
    padding: 6,
    gap: 6,
  },
  action: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNeutral: {backgroundColor: 'rgba(255,255,255,0.12)'},
  actionDanger: {backgroundColor: 'rgba(255,105,97,0.14)'},
  actionText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  actionDangerText: {color: colors.destructive},
});
