/**
 * @file Toast.tsx
 * @description Design v2 toast, the single toast system (replaces the three
 *   legacy ones as screens are rebuilt). Call `toast.show()` from anywhere;
 *   a `ToastHost` draws it as a floating glass capsule. Several hosts can be
 *   mounted (app root, inside each Sheet's Modal): only the most recently
 *   mounted one draws, so a toast always shows above any open sheet.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useId, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import {create} from 'zustand';
import GlassSurface from './GlassSurface';
import Text from './Text';
import {colors, spacing, springs, timings} from '../../theme';
import CheckIcon from '../icons/CheckIcon';
import AlertIcon from '../icons/AlertIcon';
import {haptic} from '../../services/haptics';

export type ToastKind = 'info' | 'success' | 'error';

type ToastData = {
  id: number;
  message: string;
  kind: ToastKind;
  action?: {label: string; onPress: () => void};
};

type ToastState = {
  current: ToastData | null;
  hosts: string[];
  show: (data: Omit<ToastData, 'id'>) => void;
  hide: () => void;
  addHost: (id: string) => void;
  removeHost: (id: string) => void;
};

const SHOW_MS = 2500;
const SHOW_WITH_ACTION_MS = 4000;
const HIDDEN_OFFSET = 24;

let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const useToastStore = create<ToastState>(set => ({
  current: null,
  hosts: [],
  show: data => {
    if (hideTimer) clearTimeout(hideTimer);
    set({current: {...data, id: nextId++}});
    hideTimer = setTimeout(() => set({current: null}), data.action ? SHOW_WITH_ACTION_MS : SHOW_MS);
  },
  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({current: null});
  },
  addHost: id => set(s => ({hosts: [...s.hosts, id]})),
  removeHost: id => set(s => ({hosts: s.hosts.filter(h => h !== id)})),
}));

/** Imperative API, usable outside React components. */
export const toast = {
  show: (message: string, options?: {kind?: ToastKind; action?: ToastData['action']}) => {
    const kind = options?.kind ?? 'info';
    if (kind === 'success') haptic('success');
    else if (kind === 'error') haptic('warning');
    AccessibilityInfo.announceForAccessibility(message);
    useToastStore.getState().show({message, kind, action: options?.action});
  },
  success: (message: string) => toast.show(message, {kind: 'success'}),
  error: (message: string) => toast.show(message, {kind: 'error'}),
  hide: () => useToastStore.getState().hide(),
};

const KIND_COLOR: Record<ToastKind, string | null> = {
  info: null,
  success: colors.success,
  error: colors.destructive,
};

/** Success and error get a stroke icon in colour, drawn like the icon set. */
function KindMark({kind}: {kind: ToastKind}) {
  const color = KIND_COLOR[kind];
  if (!color) return null;
  return kind === 'success' ? (
    <CheckIcon size={20} color={color} strokeWidth={2.4} />
  ) : (
    <AlertIcon size={20} color={color} triangle />
  );
}

type CapsuleProps = {
  message: string;
  kind: ToastKind;
  action?: ToastData['action'];
};

/** The toast capsule itself, without the enter / exit animation. */
export function ToastCapsule({message, kind, action}: CapsuleProps) {
  return (
    <GlassSurface style={styles.capsule}>
      <KindMark kind={kind} />
      <Text variant="subhead" numberOfLines={2} style={styles.message}>
        {message}
      </Text>
      {action ? (
        <Pressable
          onPress={() => {
            action.onPress();
            toast.hide();
          }}
          accessibilityRole="button"
          hitSlop={12}>
          <Text variant="headline" color="accent">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}

type HostProps = {
  /** Distance from the bottom of the screen (clears the dock by default). */
  bottom?: number;
};

export function ToastHost({bottom = 120}: HostProps) {
  const id = useId();
  const current = useToastStore(s => s.current);
  const isTop = useToastStore(s => s.hosts[s.hosts.length - 1] === id);
  const [shown, setShown] = useState<ToastData | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    const {addHost, removeHost} = useToastStore.getState();
    addHost(id);
    return () => removeHost(id);
  }, [id]);

  useEffect(() => {
    if (current) {
      setShown(current);
      progress.value = withSpring(1, springs.sheet);
    } else {
      progress.value = withTiming(0, timings.press);
    }
  }, [current, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{translateY: (1 - progress.value) * HIDDEN_OFFSET}],
  }));

  if (!isTop || !shown) return null;

  return (
    <Animated.View
      pointerEvents={current ? 'box-none' : 'none'}
      style={[styles.wrap, {bottom}, style]}
      accessibilityLiveRegion="polite">
      <ToastCapsule message={shown.message} kind={shown.kind} action={shown.action} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {position: 'absolute', left: spacing.m, right: spacing.m},
  capsule: {
    minHeight: 52,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.s + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
  },
  message: {flex: 1},
});
