/**
 * @file QueueSheet.tsx
 * @description Bottom sheet showing the current playback queue. Supports
 *   drag-and-drop reordering, individual removal, and move-to-top actions.
 *   Rows are keyed by track; moves go through the playback engine, across zones.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
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
import {useSettingsStore} from '../store/settingsStore';

const ORANGE = '#FF6B35';
const SHEET_HEIGHT_RATIO = 0.85;
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

interface QueueRowProps {
  item: Track;
  drag: () => void;
  isActive: boolean;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const QueueRow = React.memo(function QueueRow({item, drag, isActive, isEditMode, isSelected, onSelect}: QueueRowProps) {
  const dragRef = useRef(drag);
  dragRef.current = drag;

  return (
    <ScaleDecorator>
      <TouchableOpacity
        style={[styles.queueRow, isActive && styles.queueRowDragging]}
        onPress={() => isEditMode && onSelect(item.id)}
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
          onPressIn={() => dragRef.current()}
          hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
          style={styles.dragHandle}>
          <DragHandleIcon />
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}, (prev, next) =>
  prev.item === next.item &&
  prev.isActive === next.isActive &&
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
  const upcoming = usePlayerStore(s => s.upcoming);
  // Rows keyed by track, not by position, so a reorder never remounts the
  // wrong rows (a repeated track gets #2, #3…).
  const rowKeys = useMemo(() => {
    const seen: Record<string, number> = {};
    return upcoming.map(t => {
      seen[t.id] = (seen[t.id] ?? 0) + 1;
      return seen[t.id] > 1 ? `${t.id}#${seen[t.id]}` : t.id;
    });
  }, [upcoming]);
  const currentPlaylistName = usePlayerStore(s => s.currentPlaylistName);
  const isShuffled = usePlayerStore(s => s.isShuffled);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const setShuffleMode = usePlayerStore(s => s.setShuffleMode);
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

  const handleRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    removeFromQueue([...selectedIds]);
    exitEditMode();
  }, [selectedIds, removeFromQueue, exitEditMode]);

  useEffect(() => {
    if (!visible) exitEditMode();
  }, [visible, exitEditMode]);

  const renderItem = useCallback(
    ({item, drag, isActive}: RenderItemParams<Track>) => (
      <QueueRow
        item={item}
        drag={drag}
        isActive={isActive}
        isEditMode={isEditMode}
        isSelected={selectedIds.has(item.id)}
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
            <DraggableFlatList
              data={upcoming}
              keyExtractor={(item, idx) => (rowKeys[idx]?.startsWith(item.id) ? rowKeys[idx] : item.id)}
              onDragEnd={({from, to}) => reorderQueue(from, to)}
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
            </View>
          ) : (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.bottomBtn, {width: bottomBtnWidth}, isFetchingMagic && styles.dimmed]}
                onPress={() => {
                  if (isOfflineMode && shuffleMode === 'on') { setShuffleMode('off'); return; }
                  toggleShuffle();
                }}
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
                <RepeatIcon color={repeatActive ? ORANGE : '#fff'} />
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
