/**
 * @file DrawerContainer.tsx
 * @description Custom drawer implementation using React context + Animated.
 *   Replaces @react-navigation/drawer which caused a WorkletsError with
 *   react-native-reanimated v4 on New Architecture.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  useWindowDimensions,
  Easing,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import {darkTheme} from '../theme';
import CustomDrawerContent from './CustomDrawerContent';

const DRAWER_WIDTH_RATIO = 0.8;

type DrawerCtx = {open: () => void; close: () => void};
const DrawerContext = createContext<DrawerCtx>({open: () => {}, close: () => {}});
export const useDrawer = () => useContext(DrawerContext);

type Props = {children: React.ReactNode};

export default function DrawerContainer({children}: Props) {
  // Measured on every render so the drawer width follows rotation.
  const drawerWidth = useWindowDimensions().width * DRAWER_WIDTH_RATIO;
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    setVisible(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const close = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setVisible(false));
  }, [progress]);

  const drawerTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const contentTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, drawerWidth],
  });

  const contentScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.88],
  });

  const contentBorderRadius = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 16],
  });

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const closeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onEnd(e => {
      'worklet';
      if (e.translationX < -30 || e.velocityX < -300) {
        runOnJS(close)();
      }
    });

  return (
    <DrawerContext.Provider value={{open, close}}>
      <View style={styles.root}>
        {/* Drawer panel (behind main content) */}
        {visible && (
          <GestureDetector gesture={closeGesture}>
            <Animated.View
              style={[
                styles.drawer,
                {width: drawerWidth},
                {transform: [{translateX: drawerTranslateX}]},
              ]}>
              <CustomDrawerContent onClose={close} />
            </Animated.View>
          </GestureDetector>
        )}

        {/* Animated main content */}
        <Animated.View
          style={[
            styles.content,
            {
              transform: [
                {translateX: contentTranslateX},
                {scale: contentScale},
              ],
              borderRadius: contentBorderRadius,
            },
          ]}>
          {children}

          {/* Overlay sombre + tap pour fermer */}
          {visible && (
            <TouchableWithoutFeedback onPress={close}>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  styles.overlay, {opacity: overlayOpacity},
                ]}
              />
            </TouchableWithoutFeedback>
          )}
        </Animated.View>
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  overlay: {backgroundColor: '#000'},
});
