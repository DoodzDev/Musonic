/**
 * @file storage.ts
 * @description MMKV-backed Zustand StateStorage adapter. All persisted stores
 *   share this single MMKV instance to avoid duplicate initialisation overhead.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {MMKV} from 'react-native-mmkv';
import {StateStorage} from 'zustand/middleware';

export const storage = new MMKV({id: 'musonic-storage'});

export const mmkvStorage: StateStorage = {
  getItem: key => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
