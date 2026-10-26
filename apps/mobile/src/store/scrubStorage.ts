/**
 * @file scrubStorage.ts
 * @description Wipes replaced values (a password traded for a key) from the
 *   MMKV file, which only ever appends.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import RNBlobUtil from 'react-native-blob-util';
import {STORAGE_ID, storage} from './storage';

const SCRUB_KEY = '__scrub';

/**
 * Leaves no trace of replaced values in the file. MMKV only appends, so an old
 * value stays on disk until it is written over: a filler as large as the file
 * makes MMKV move the live values to its start and lay the filler over
 * everything else; deleting the filler and trimming then shrinks it back.
 */
export async function scrubStorage(): Promise<void> {
  const {size} = await RNBlobUtil.fs.stat(`${RNBlobUtil.fs.dirs.DocumentDir}/mmkv/${STORAGE_ID}`);
  storage.set(SCRUB_KEY, ' '.repeat(Number(size)));
  storage.delete(SCRUB_KEY);
  storage.trim();
}
