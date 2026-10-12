/**
 * @file useLandscapeSidebarPadding.ts
 * @description Returns the left/right padding a screen's root container needs
 *   to avoid rendering underneath the landscape nav sidebar (TabNavigator's
 *   Rail), plus the side safe-area insets (camera cutout, navigation bar). On
 *   the rail's side the rail column itself absorbs the inset (`railWidth`).
 *   Zero on both sides in portrait. Single source of truth so each screen
 *   doesn't reimplement the isLandscape + navBarPosition branching.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useIsLandscape} from './useIsLandscape';
import {useSettingsStore} from '../store/settingsStore';
import {SIDEBAR_WIDTH} from '../navigation/shellConstants';

/** Width of the landscape rail column: the sidebar, or the side inset if wider. */
export function railWidth(sideInset: number): number {
  return Math.max(SIDEBAR_WIDTH, sideInset);
}

export function useLandscapeSidebarPadding(): {paddingLeft: number; paddingRight: number} {
  const insets = useSafeAreaInsets();
  const isLandscape = useIsLandscape();
  const navBarPosition = useSettingsStore(s => s.navBarPosition);

  if (!isLandscape) return {paddingLeft: 0, paddingRight: 0};
  return navBarPosition === 'right'
    ? {paddingLeft: insets.left, paddingRight: railWidth(insets.right)}
    : {paddingLeft: railWidth(insets.left), paddingRight: insets.right};
}
