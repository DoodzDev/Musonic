/**
 * @file useSetupPlayer.ts
 * @description Hook that initialises the player once on app mount (see
 *   services/setupPlayer, shared with the Android Auto wake-up task).
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import {setupPlayer} from '../services/setupPlayer';

export function useSetupPlayer() {
  useEffect(() => {
    setupPlayer();
  }, []);
}
