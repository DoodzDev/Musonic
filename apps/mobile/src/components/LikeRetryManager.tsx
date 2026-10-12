/**
 * @file LikeRetryManager.tsx
 * @description Null-render component that retries failed star/unstar API calls
 *   when the track changes. Keeps optimistic UI consistent after transient errors
 *   without blocking playback.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import {useActiveTrack, usePlaybackState, State} from 'react-native-track-player';
import {usePlayerStore} from '../store/playerStore';
import {star, unstar} from '../api/endpoints/library';
import {SubsonicError} from '../api/client';
import {showToast} from './Toast';
import {useT} from '../i18n';

export default function LikeRetryManager() {
  const t = useT();
  const currentTrack = useActiveTrack();
  const {state} = usePlaybackState();
  const pendingLikeRetries = usePlayerStore(s => s.pendingLikeRetries);
  const localLikeOverrides = usePlayerStore(s => s.localLikeOverrides);
  const removePendingLikeRetry = usePlayerStore(s => s.removePendingLikeRetry);
  const revertLikeOverride = usePlayerStore(s => s.revertLikeOverride);
  const pendingLikeToast = usePlayerStore(s => s.pendingLikeToast);
  const setPendingLikeToast = usePlayerStore(s => s.setPendingLikeToast);

  useEffect(() => {
    if (!pendingLikeToast) return;
    showToast(pendingLikeToast);
    setPendingLikeToast(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLikeToast]);

  useEffect(() => {
    if (state !== State.Playing) return;
    const trackId = currentTrack?.id ? String(currentTrack.id) : '';
    if (!trackId || !pendingLikeRetries.has(trackId)) return;

    removePendingLikeRetry(trackId);
    const newLiked = localLikeOverrides[trackId];
    if (newLiked === undefined) return;

    (newLiked ? star : unstar)(trackId)
      .then(() => {
        showToast(newLiked ? t.likes.addedToLiked : t.likes.removedFromLiked);
      })
      .catch((err: unknown) => {
        revertLikeOverride(trackId);
        const isPermanent = err instanceof SubsonicError && err.isPermanent;
        showToast(isPermanent ? t.likes.unavailableTrack : t.likes.indexError);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentTrack?.id, pendingLikeRetries]);

  return null;
}
