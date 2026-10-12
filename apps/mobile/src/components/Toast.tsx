/**
 * @file Toast.tsx
 * @description Global toast notification system. Exposes `showToast(message)`
 *   imperative helper and renders a short-lived overlay above the mini player.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, Text} from 'react-native';
import {DOCK_GAP, useDockInset} from '../navigation/dockLayout';


// ─── Imperative API (global singleton) ───────────────────────────────────────
let _show: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  _show?.(msg);
}

// ─── Local Toast (props-based, for modals/overlays) ──────────────────────────
type ToastProps = {visible: boolean; message: string};

export default function Toast({visible, message}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 280,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View style={[styles.toast, {opacity}]} pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

// ─── Global Toast (rendered once in TabNavigator, above MiniPlayer) ──────────
export function GlobalToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    _show = (msg: string) => {
      setMessage(msg);
      setVisible(true);
    };
    return () => {
      _show = null;
    };
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 280,
      useNativeDriver: true,
    }).start();
    if (!visible) return;
    const id = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(id);
  }, [visible, opacity]);

  // Sits just above the Dock (and the mini player when it shows).
  const bottomOffset = useDockInset() - DOCK_GAP;

  return (
    <Animated.View
      style={[styles.globalToast, {opacity, bottom: bottomOffset}]}
      pointerEvents="none">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    zIndex: 9999,
    elevation: 99,
  },
  globalToast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    zIndex: 9999,
    elevation: 99,
  },
  text: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
});
