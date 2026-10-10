/**
 * @file searchHistoryStore.ts
 * @description Zustand + MMKV store for typed search history. Keeps the last 35
 *   unique items (text queries, artists, albums, songs); shown in SearchActive
 *   when the input is focused and empty.
 * @author DoodzProg
 * @version 1.1.1
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';

const MAX_HISTORY = 35;

export type HistoryItem =
  | {type: 'text'; query: string}
  | {type: 'artist'; id: string; name: string; imageUrl?: string}
  | {type: 'album'; id: string; name: string; artist: string}
  | {type: 'song'; id: string; title: string; artist: string; duration?: number; coverArt?: string};

function historyKey(item: HistoryItem): string {
  switch (item.type) {
    case 'text': return `text:${item.query.toLowerCase()}`;
    case 'artist': return `artist:${item.id}`;
    case 'album': return `album:${item.id}`;
    case 'song': return `song:${item.id}`;
  }
}

type SearchHistoryState = {
  history: HistoryItem[];
  addItem: (item: HistoryItem) => void;
  clearHistory: () => void;
};

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    set => ({
      history: [],
      addItem: (item: HistoryItem) =>
        set(state => {
          if (item.type === 'text' && !item.query.trim()) return state;
          const key = historyKey(item);
          const deduped = state.history.filter(h => historyKey(h) !== key);
          return {history: [item, ...deduped].slice(0, MAX_HISTORY)};
        }),
      clearHistory: () => set({history: []}),
    }),
    {
      name: 'musonic-search-history-v2',
      storage: createJSONStorage(() => mmkvStorage),
      // Bump on any change to the persisted shape and handle the old version in `migrate`.
      // Without `migrate`, a version mismatch discards the stored data.
      version: 1,
      // v0 (unversioned) -> v1: same shape, versioning only.
      migrate: persistedState => persistedState as SearchHistoryState,
    },
  ),
);
