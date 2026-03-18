import { create } from 'zustand';
import { Category, Stream, StreamType } from '../types';
import { fetchCategories, fetchStreamsByCategory } from '../api/streams';

type CategoryMap = Record<StreamType, Category[]>;

interface StreamStore {
  categories: CategoryMap;
  streams: Record<string, Stream[]>; // key: `${type}:${categoryId}`
  loadingCategories: boolean;
  loadingStreams: boolean;
  error: string | null;

  loadCategories: (type: StreamType) => Promise<void>;
  loadStreams: (type: StreamType, categoryId: string) => Promise<void>;
  invalidateStreams: (type: StreamType, categoryId: string) => void;
  clearAll: () => void;
  clearError: () => void;
}

const emptyCategories: CategoryMap = { live: [], vod: [] };

export const useStreamStore = create<StreamStore>((set, get) => ({
  categories: emptyCategories,
  streams: {},
  loadingCategories: false,
  loadingStreams: false,
  error: null,

  loadCategories: async (type) => {
    if (get().categories[type].length > 0) return; // cached
    set({ loadingCategories: true, error: null });
    try {
      const categories = await fetchCategories(type);
      set((s) => ({ categories: { ...s.categories, [type]: categories } }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Failed to load categories' });
    } finally {
      set({ loadingCategories: false });
    }
  },

  loadStreams: async (type, categoryId) => {
    const key = `${type}:${categoryId}`;
    if (get().streams[key]) return; // cached

    set({ loadingStreams: true, error: null });
    try {
      const streams = await fetchStreamsByCategory(type, categoryId);
      set((s) => ({
        streams: { ...s.streams, [key]: streams },
        categories: {
          ...s.categories,
          [type]: s.categories[type].map((c) =>
            c.id === categoryId ? { ...c, streamCount: streams.length } : c,
          ),
        },
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Failed to load streams' });
    } finally {
      set({ loadingStreams: false });
    }
  },

  invalidateStreams: (type, categoryId) => {
    const key = `${type}:${categoryId}`;
    set((s) => {
      const updated = { ...s.streams };
      delete updated[key];
      return { streams: updated };
    });
  },

  clearAll: () => set({ categories: emptyCategories, streams: {} }),
  clearError: () => set({ error: null }),
}));
