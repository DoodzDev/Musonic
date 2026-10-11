/**
 * @file AudioPlayer.tsx
 * @description Null-render RNTP event bridge. Mounts once in App.tsx and syncs
 *   RNTP playback events (track change, queue updates) into playerStore so the
 *   rest of the UI stays reactive without subscribing to RNTP directly. On
 *   mount it also picks up a track already playing (app reopened while the
 *   playback service kept running), so the mini player shows straight away.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import TrackPlayer, {Event, useTrackPlayerEvents} from 'react-native-track-player';
import {usePlayerStore} from '../store/playerStore';
import type {Track} from '../store/playerStore';

const SYNC_EVENTS = [Event.PlaybackActiveTrackChanged];

function mapToTrack(t: any): Track {
  return {
    id: String(t.id ?? ''),
    title: t.title ?? '',
    artist: t.artist ?? '',
    album: t.album ?? '',
    duration: t.duration ?? 0,
    coverArt: t.coverArt,
    streamUrl: String(t.url ?? ''),
    artistId: t.artistId,
    url: String(t.url ?? ''),
    artwork: typeof t.artwork === 'string' ? t.artwork : undefined,
    isMagic: t.isMagic ? true : undefined,
    isAutoplay: t.isAutoplay ? true : undefined,
  };
}

/** Shows the mini player and mirrors the RNTP queue around the active index. */
async function syncActiveTrack(index: number) {
  const store = usePlayerStore.getState();
  store.onTrackChanged();
  try {
    const queue = await TrackPlayer.getQueue();
    const history = queue.slice(0, index).map(mapToTrack);
    const upcoming = queue.slice(index + 1).map(mapToTrack);
    store.setHistory(history);
    store.setUpcoming(
      store.repeatMode === 'all' ? [...upcoming, ...history] : upcoming,
    );
  } catch {}
}

export default function AudioPlayer() {
  useTrackPlayerEvents(SYNC_EVENTS, async event => {
    if (event.type !== Event.PlaybackActiveTrackChanged || !event.track) return;
    await syncActiveTrack(event.index ?? 0);
  });

  // App reopened while the service kept playing: no track-change event comes.
  useEffect(() => {
    TrackPlayer.getActiveTrackIndex()
      .then(index => {
        if (index !== undefined) syncActiveTrack(index);
      })
      .catch(() => {}); // Player not set up yet: the next track change will sync.
  }, []);

  return null;
}
