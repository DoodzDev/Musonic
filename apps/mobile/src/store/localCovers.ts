/**
 * @file localCovers.ts
 * @description Cover art saved on the device next to downloaded tracks (ISS-034),
 *   so every downloaded track keeps its cover offline. Keeps an in-memory
 *   registry `cover id → file` that `getCoverArtUrl` reads first: lists, mini
 *   player, full player and the lock screen all get the local file, whatever
 *   size they ask for. Leaf module: it must not import the API client or the
 *   download store (both import it).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import RNBlobUtil from 'react-native-blob-util';

/** Size of the saved cover: large enough for the full player. */
export const LOCAL_COVER_SIZE = 600;

const COVERS_DIR = `${RNBlobUtil.fs.dirs.DocumentDir}/musonic/covers`;

/** `cover id → file:// URI` of the covers saved on the device. */
let _registry = new Map<string, string>();

/** Cover id of a track, as used by the whole app (`coverArt || id`). */
export function coverKeyOf(track: {coverArt?: string; trackId: string}): string {
  return track.coverArt || track.trackId;
}

/** Absolute path of a saved cover. The id is sanitised: it becomes a file name. */
export function coverFilePath(key: string): string {
  return `${COVERS_DIR}/${key.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
}

/** Local `file://` URI of a saved cover, or undefined if it is not on the device. */
export function getLocalCoverUri(key: string): string | undefined {
  return _registry.get(key);
}

/** Replaces the registry with the given saved cover ids (called on every download change). */
export function setLocalCovers(keys: Iterable<string>): void {
  const next = new Map<string, string>();
  for (const key of keys) next.set(key, `file://${coverFilePath(key)}`);
  _registry = next;
}

/**
 * Downloads a cover to its local file unless it is already there.
 * Resolves true when the file exists afterwards. Never logs `remoteUrl`:
 * it carries the account credentials.
 */
export async function saveCover(key: string, remoteUrl: string): Promise<boolean> {
  const path = coverFilePath(key);
  if (await RNBlobUtil.fs.exists(path)) return true;
  await RNBlobUtil.fs.mkdir(COVERS_DIR).catch(() => {
    // Directory already exists — not an error.
  });
  const tmp = `${path}.part`;
  try {
    const res = await RNBlobUtil.config({path: tmp, fileCache: false}).fetch('GET', remoteUrl);
    const {status, headers} = res.info();
    const type = String(headers['Content-Type'] ?? headers['content-type'] ?? '');
    // Subsonic answers errors as XML/JSON with HTTP 200: only keep real images.
    if (status !== 200 || !type.startsWith('image/')) {
      await RNBlobUtil.fs.unlink(tmp).catch(() => {});
      return false;
    }
    await RNBlobUtil.fs.mv(tmp, path);
    return true;
  } catch {
    await RNBlobUtil.fs.unlink(tmp).catch(() => {});
    return false;
  }
}

/** Deletes a saved cover file. Errors are ignored: a missing file is the goal. */
export async function deleteCoverFile(key: string): Promise<void> {
  const path = coverFilePath(key);
  if (await RNBlobUtil.fs.exists(path).catch(() => false)) {
    await RNBlobUtil.fs.unlink(path).catch(() => {});
  }
}
