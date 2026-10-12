/**
 * @file useHeaderTopInset.ts
 * @description Top padding a screen's header should reserve for the OS status
 *   bar area. Returns the real safe-area inset normally, or a small fixed
 *   margin when fullscreen mode is on (status bar hidden, header allowed to
 *   sit as high as possible) — single source of truth so this doesn't need
 *   reimplementing per screen.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useSettingsStore} from '../store/settingsStore';

const FULLSCREEN_TOP_MARGIN = 8;

export function useHeaderTopInset(): number {
  const insets = useSafeAreaInsets();
  const isFullscreenMode = useSettingsStore(s => s.isFullscreenMode);
  return isFullscreenMode ? FULLSCREEN_TOP_MARGIN : insets.top;
}
