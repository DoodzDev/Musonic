/**
 * @file downloadState.ts
 * @description A track row's download state, read from the download store's two maps. Kept
 *   apart from TrackRow so it can be used (and tested) without loading any view.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

export type DownloadState = 'none' | 'downloading' | 'done' | 'failed';

/** A track's download state, from the download store's two maps (`failed`: tap to retry). */
export function downloadStateOf(
  id: string,
  downloads: Record<string, unknown>,
  active: Record<string, {status: string} | undefined>,
): DownloadState {
  if (id in downloads) return 'done';
  const status = active[id]?.status;
  if (status === 'queued' || status === 'downloading') return 'downloading';
  return status === 'error' ? 'failed' : 'none';
}
