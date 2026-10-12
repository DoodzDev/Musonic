/**
 * @file QueueSheet.tsx
 * @description Bottom sheet showing the current playback queue. Supports
 *   drag-and-drop reordering, individual removal, and move-to-top actions.
 *   Rows are keyed by queue entry (a track present twice has two entries);
 *   moves go through the playback engine, across zones. The list keeps its
 *   own order and only takes the engine's when it really differs, so a drop
 *   is never followed by a second update mid-animation. The list is a
 *   reorderable list driven on the UI thread: while a row is dragged the
 *   list cannot scroll, and a swipe outside the handle only scrolls.
 *   "Clear all" (edit mode) empties what comes next; a toast offers Undo.
 * @author DoodzProg
 * @version 2.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  LayoutAnimation,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import ReorderableList, {
  reorderItems,
  useIsActive,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import CoverArt from './CoverArt';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon';
import RepeatIcon from './icons/RepeatIcon';
import CloseIcon from './icons/CloseIcon';
import ShuffleIcon from './icons/ShuffleIcon';
import TrackMagicIcon from './icons/TrackMagicIcon';
import {useT} from '../i18n';
import {useActiveTrack, usePlaybackState, State} from 'react-native-track-player';
import {usePlayerStore, type Track, type ShuffleMode} from '../store/playerStore';
import {playbackEngine} from '../services/playback/engine';
import {toast, ToastHost} from './ui/Toast';

const ORANGE = '#FF6B35';
const SHEET_HEIGHT_RATIO = 0.85;
/** Toast distance from the bottom: clears the bottom bar. */
const TOAST_BOTTOM = 110;
// sheetInner paddingHorizontal=20 both sides (40 total), 2 gaps of 8px between 3 buttons.

// ─── Animated Equalizer ───────────────────────────────────────────────────────

function Equalizer({playing}: {playing: boolean}) {
  const b1 = useSharedValue(3);
  const b2 = useSharedValue(3);
  const b3 = useSharedValue(3);

  const s1 = useAnimatedStyle(() => ({height: b1.value}));
  const s2 = useAnimatedStyle(() => ({height: b2.value}));
  const s3 = useAnimatedStyle(() => ({height: b3.value}));

  useEffect(() => {
    const bars = [b1, b2, b3];
    if (playing) {
      bars.forEach((bar, i) => {
        bar.value = withRepeat(
          withSequence(
            withTiming(14, {duration: 320 + i * 80}),
            withTiming(3, {duration: 300 + i * 60}),
          ),
          -1,
        );
      });
    } else {
      bars.forEach(bar => {
        cancelAnimation(bar);
        bar.value = withTiming(3, {duration: 150});
      });
    }
    return () => bars.forEach(bar => cancelAnimation(bar));
  }, [playing, b1, b2, b3]);

  return (
    <View style={styles.eqContainer}>
      <ReAnimated.View style={[styles.eqBar, s1]} />
      <ReAnimated.View style={[styles.eqBar, s2]} />
      <ReAnimated.View style={[styles.eqBar, s3]} />
    </View>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function DragHandleIcon() {
  return (
    <Svg width={18} height={14} viewBox="0 0 18 14">
      <Rect x={0} y={0} width={18} height={2.5} rx={1.25} fill="#535353" />
      <Rect x={0} y={5.75} width={18} height={2.5} rx={1.25} fill="#535353" />
      <Rect x={0} y={11.5} width={18} height={2.5} rx={1.25} fill="#535353" />
    </Svg>
  );
}

function CheckCircle({selected}: {selected: boolean}) {
  if (!selected) {
    return <View style={styles.checkEmpty} />;
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill={ORANGE} />
      <Path
        d="M6 12 L10 16 L18 8"
        stroke="#000"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function TimerIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={9} stroke="#fff" strokeWidth={2} fill="none" />
      <Path
        d="M12 8 L12 13 L15 15"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M9 2 L15 2" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

/** Queue entry key (the engine sets one per entry). */
function rowKey(t: Track): string {
  return t.entryId ?? t.id;
}

/** Same rows, same order, same roles: nothing worth re-rendering. */
function sameRows(a: Track[], b: Track[]): boolean {
  return a.length === b.length && a.every((t, i) =>
    rowKey(t) === rowKey(b[i]) && !!t.isMagic === !!b[i].isMagic && !!t.isAutoplay === !!b[i].isAutoplay);
}

interface QueueRowProps {
  item: Track;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const QueueRow = React.memo(function QueueRow({item, isEditMode, isSelected, onSelect}: QueueRowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <TouchableOpacity
      style={[styles.queueRow, isActive && styles.queueRowDragging]}
      onPress={() => isEditMode && onSelect(rowKey(item))}
      activeOpacity={isEditMode ? 0.6 : 1}>
      {isEditMode && (
        <View style={styles.checkWrapper}>
          <CheckCircle selected={isSelected} />
        </View>
      )}
      <CoverArt id={item.coverArt} size={48} borderRadius={4} />
      <View style={styles.queueRowInfo}>
        <Text style={styles.queueRowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.queueRowArtistRow}>
          {item.isMagic && <TrackMagicIcon size={10} />}
          <Text style={styles.queueRowArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPressIn={drag}
        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
        style={styles.dragHandle}>
        <DragHandleIcon />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.isEditMode === next.isEditMode &&
  prev.isSelected === next.isSelected &&
  prev.onSelect === next.onSelect,
);

// ─── QueueSheet ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  slideY: Animated.Value;
}

export default function QueueSheet({visible, onClose, slideY}: Props) {
  // Measured on every render so the sheet follows rotation.
  const {width: winW, height: winH} = useWindowDimensions();
  const sheetHeight = winH * SHEET_HEIGHT_RATIO;
  const bottomBtnWidth = Math.floor((winW - 40 - 16) / 3);
  const t = useT();
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const isPlaying = state === State.Playing;
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
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const isFetchingMagic = usePlayerStore(s => s.isFetchingMagic);
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat);
  const reorderQueue = usePlayerStore(s => s.reorderQueue);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const moveToTop = usePlayerStore(s => s.moveToTop);

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const headerGesture = Gesture.Pan()
    .minDistance(10)
    .onEnd(e => {
      'worklet';
      if (e.translationY > 50 || e.velocityY > 500) {
        runOnJS(onClose)();
      }
    });

  const exitEditMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterEditMode = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsEditMode(true);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleMoveToTop = useCallback(() => {
    if (selectedIds.size === 0) return;
    moveToTop([...selectedIds]);
    exitEditMode();
  }, [selectedIds, moveToTop, exitEditMode]);

  // Moves by entry (the moved one and the one now after it), never by
  // position: fast successive drags can't target a stale row.
  const rowsRef = useRef(upcoming);
  rowsRef.current = upcoming;
  const handleReorder = useCallback(({from, to}: ReorderableListReorderEvent) => {
    if (from === to) return;
    const data = reorderItems(rowsRef.current, from, to);
    const moved = data[to];
    if (!moved) return;
    rowsRef.current = data;
    setUpcoming(data);
    pendingMoves.current++;
    reorderQueue(rowKey(moved), data[to + 1] ? rowKey(data[to + 1]) : null).finally(() => {
      pendingMoves.current--;
      if (pendingMoves.current === 0) syncFromStore();
    });
  }, [reorderQueue, syncFromStore]);

  const handleClearAll = useCallback(() => {
    playbackEngine.clearQueue();
    exitEditMode();
    toast.show(t.queue.clearedToast, {
      kind: 'success',
      action: {label: t.queue.undo, onPress: () => playbackEngine.undoClearQueue()},
    });
  }, [exitEditMode, t]);

  const handleRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    removeFromQueue([...selectedIds]);
    exitEditMode();
  }, [selectedIds, removeFromQueue, exitEditMode]);

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
  const repeatActive = repeatMode !== 'none';

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, {height: sheetHeight, transform: [{translateY: slideY}]}]}>
        <SafeAreaView style={styles.sheetInner} edges={['bottom']}>

          {/* ── Top zone with swipe-to-close ── */}
          <GestureDetector gesture={headerGesture}>
          <View>
            <View style={styles.pill} />

            <View style={styles.header}>
              {isEditMode ? (
                <>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {t.queue.editTitle(selectedIds.size)}
                  </Text>
                  <TouchableOpacity
                    onPress={exitEditMode}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <CloseIcon />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.headerTitle}>{t.queue.title}</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={enterEditMode}>
                    <Text style={styles.editBtnText}>{t.queue.modifyButton}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Text style={styles.subtitle}>
              {t.queue.nowPlaying(currentPlaylistName || t.queue.fallbackName)}
            </Text>

            <View style={styles.currentRow}>
              <Equalizer playing={isPlaying} />
              <View style={styles.currentInfo}>
                <Text style={styles.currentTitle} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.currentArtist} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </View>
              <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
                {isPlaying ? <PauseIcon size={13} color="#000" /> : <PlayIcon size={13} />}
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />
          </View>
          </GestureDetector>

          {/* ── Draggable list ── */}
          <GestureHandlerRootView style={styles.fill}>
            <ReorderableList
              data={upcoming}
              keyExtractor={rowKey}
              onReorder={handleReorder}
              shouldUpdateActiveItem
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          </GestureHandlerRootView>

          {/* ── Bottom bar ── */}
          {isEditMode ? (
            <View style={styles.editBar}>
              <TouchableOpacity onPress={handleMoveToTop} disabled={!hasSelection}>
                <Text style={[styles.editAction, !hasSelection && styles.editActionDisabled]}>
                  {t.queue.moveToTop}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRemove} disabled={!hasSelection}>
                <Text style={[styles.editAction, !hasSelection && styles.editActionDisabled]}>
                  {t.queue.removeButton}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearAll} disabled={upcoming.length === 0}>
                <Text style={[styles.editAction, upcoming.length === 0 && styles.editActionDisabled]}>
                  {t.queue.clearAll}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.bottomBtn, {width: bottomBtnWidth}, isFetchingMagic && styles.dimmed]}
                onPress={toggleShuffle}
                disabled={isFetchingMagic}
                activeOpacity={0.7}>
                {isFetchingMagic
                  ? <ActivityIndicator size="small" color={ORANGE} />
                  : <ShuffleIcon size={22} mode={shuffleMode as ShuffleMode} color={isShuffled ? ORANGE : '#fff'} />}
                <Text style={[styles.bottomBtnLabel, isShuffled && styles.bottomBtnLabelActive]}>
                  {t.queue.shuffle}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomBtn, {width: bottomBtnWidth}]}
                onPress={cycleRepeat}
                activeOpacity={0.7}>
                <RepeatIcon mode={repeatMode} color={repeatActive ? ORANGE : '#fff'} />
                <Text style={[styles.bottomBtnLabel, repeatActive && styles.bottomBtnLabelActive]}>
                  {t.queue.repeat}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.bottomBtn, {width: bottomBtnWidth}]} activeOpacity={0.7}>
                <TimerIcon />
                <Text style={styles.bottomBtnLabel}>{t.queue.timer}</Text>
              </TouchableOpacity>
            </View>
          )}

        </SafeAreaView>
      </Animated.View>

      {/* The player is a Modal: toasts need their own host here, above the bottom bar. */}
      <ToastHost bottom={TOAST_BOTTOM} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {flex: 1},
  listContent: {paddingBottom: 8},
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 200,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#535353',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetInner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginRight: 12,
  },
  editBtn: {
    backgroundColor: '#282828',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    color: '#A7A7A7',
    marginBottom: 16,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    gap: 12,
  },
  currentInfo: {
    flex: 1,
  },
  currentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ORANGE,
  },
  currentArtist: {
    fontSize: 13,
    color: '#A7A7A7',
    marginTop: 2,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
    marginBottom: 8,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  queueRowDragging: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  checkWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#535353',
  },
  queueRowInfo: {
    flex: 1,
  },
  queueRowTitle: {
    fontSize: 16,
    color: '#fff',
  },
  queueRowArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  queueRowArtist: {
    fontSize: 14,
    color: '#A7A7A7',
    flex: 1,
  },
  dragHandle: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  editAction: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  editActionDisabled: {
    color: '#535353',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomBtn: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  bottomBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  bottomBtnLabelActive: {
    color: ORANGE,
  },
  eqContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: 20,
    height: 16,
    gap: 3,
  },
  eqBar: {
    width: 4,
    backgroundColor: ORANGE,
    borderRadius: 1,
  },
  dimmed: {
    opacity: 0.5,
  },
});
