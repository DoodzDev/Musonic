/**
 * @file Sheet.tsx
 * @description Design v2 bottom sheet, the single sheet of the app (replaces
 *   the five legacy sheets as screens are rebuilt). Height follows its
 *   content up to 90 % of the screen and adapts to rotation. Opens with the
 *   no-bounce sheet spring; closes by swiping down (shared DISMISS
 *   thresholds), tapping the dimmed backdrop or pressing Back. Hosts its own
 *   ToastHost so toasts show above it. An optional fixed `header` sits under
 *   the handle and is part of the swipe-to-close zone; with `headerSide`
 *   (landscape) it becomes a column on the left of the content.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, useWindowDimensions, View} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Text from './Text';
import {ToastHost} from './Toast';
import {DISMISS, rubberBand} from './gestures';
import {colors, radii, spacing, springs} from '../../theme';
import {useT} from '../../i18n';

type Props = {
  visible: boolean;
  /** Called when the user asks to close; set `visible` to false in response. */
  onClose: () => void;
  title?: string;
  /**
   * Fixed content under the handle and title. It never scrolls and is part
   * of the swipe-to-close zone, so a scrollable sheet can also be closed
   * from there.
   */
  header?: React.ReactNode;
  /** Put `header` in a column left of the content (landscape) instead of above it. */
  headerSide?: boolean;
  /**
   * Set when the content scrolls: the swipe-to-close then only starts on the
   * handle, title and `header`, so scrolling the content never drags the sheet.
   */
  scrollable?: boolean;
  children: React.ReactNode;
};

const MAX_HEIGHT_RATIO = 0.9;
const CLOSE_MS = 220;

export default function Sheet({
  visible,
  onClose,
  title,
  header: fixedHeader,
  headerSide = false,
  scrollable = false,
  children,
}: Props) {
  const t = useT();
  const {height: screenHeight} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const offset = useSharedValue(screenHeight);
  /** Set once the open animation has started for the current opening. */
  const opening = useRef(false);

  useEffect(() => {
    if (visible) {
      // The spring starts in `onLayout`, once the content is mounted and
      // measured: starting it now would stutter while a long list mounts.
      opening.current = false;
      offset.value = screenHeight;
      setMounted(true);
    } else if (mounted) {
      offset.value = withTiming(screenHeight, {duration: CLOSE_MS}, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // `mounted` is read, not tracked: re-running when it flips would replay the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, screenHeight, offset]);

  // A factory: one gesture object cannot be attached to two detectors.
  const makePan = () =>
    Gesture.Pan()
      .activeOffsetY(12)
      .failOffsetX([-12, 12])
      .onUpdate(e => {
        offset.value = e.translationY > 0 ? e.translationY : rubberBand(e.translationY, 0);
      })
      .onEnd(e => {
        if (e.translationY > DISMISS.distance || e.velocityY > DISMISS.velocity) {
          runOnJS(onClose)();
        } else {
          offset.value = withSpring(0, springs.sheet);
        }
      });

  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: Math.max(-12, offset.value)}]}));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, offset.value) / screenHeight),
  }));

  if (!mounted) return null;

  const header = (
    <View>
      <View style={styles.handleZone}>
        <View style={styles.handle} />
      </View>
      {title ? (
        <Text variant="headline" style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {headerSide ? null : fixedHeader}
    </View>
  );

  const draggable = (node: React.ReactNode) =>
    scrollable ? <GestureDetector gesture={makePan()}>{node}</GestureDetector> : node;

  const onBodyLayout = () => {
    if (!visible || opening.current) return;
    opening.current = true;
    offset.value = withSpring(0, springs.sheet);
  };

  const body = (
    <Animated.View
      onLayout={onBodyLayout}
      accessibilityViewIsModal
      style={[
        styles.sheet,
        {maxHeight: screenHeight * MAX_HEIGHT_RATIO, paddingBottom: insets.bottom + spacing.m},
        sheetStyle,
      ]}>
      {draggable(header)}
      {headerSide && fixedHeader ? (
        <View style={styles.sideRow}>
          {draggable(<View style={styles.side}>{fixedHeader}</View>)}
          <View style={styles.sideContent}>{children}</View>
        </View>
      ) : (
        children
      )}
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t.ui.close}
          />
        </Animated.View>

        {scrollable ? body : <GestureDetector gesture={makePan()}>{body}</GestureDetector>}

        <ToastHost bottom={insets.bottom + spacing.l} />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {backgroundColor: colors.backdrop},
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    boxShadow: '0px -8px 30px rgba(0,0,0,0.35)',
  },
  handleZone: {height: 24, alignItems: 'center', justifyContent: 'center'},
  handle: {width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator},
  title: {textAlign: 'center', paddingHorizontal: spacing.gutter, paddingBottom: spacing.s},
  sideRow: {flexDirection: 'row', flexShrink: 1, minHeight: 0},
  side: {width: '36%', justifyContent: 'center'},
  sideContent: {flex: 1, minHeight: 0},
});
