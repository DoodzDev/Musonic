/**
 * @file dockLayout.ts
 * @description Geometry of the Design v2 Dock (floating mini player capsule
 *   above the tab capsule and search circle) and the single source of truth
 *   for how much bottom space scrolling content must leave so nothing hides
 *   under it.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {usePlayerStore} from '../store/playerStore';
import {useIsLandscape} from '../hooks/useIsLandscape';

/** Height of the mini player capsule. */
export const DOCK_MINI_HEIGHT = 64;
/** Height of the tab capsule and diameter of the search circle. */
export const DOCK_TABS_HEIGHT = 62;
/** Vertical gap between the two rows, and above the bottom inset. */
export const DOCK_GAP = 10;
/** Side margin of the Dock. */
export const DOCK_SIDE = 12;

/** Total Dock height above the bottom safe-area inset. */
export function dockHeight(miniVisible: boolean): number {
  return DOCK_TABS_HEIGHT + DOCK_GAP + (miniVisible ? DOCK_MINI_HEIGHT + DOCK_GAP : 0);
}

/**
 * Bottom padding scrolling content needs so its last item can scroll clear
 * of the Dock (portrait) or the bottom edge (landscape, where the Dock is
 * replaced by a side bar).
 */
export function useDockInset(): number {
  const insets = useSafeAreaInsets();
  const isLandscape = useIsLandscape();
  const miniVisible = usePlayerStore(s => s.isMiniPlayerVisible);
  if (isLandscape) return insets.bottom + DOCK_GAP * 2;
  return insets.bottom + dockHeight(miniVisible) + DOCK_GAP * 2;
}
