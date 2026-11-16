import { create } from 'zustand';
import { Category, Stream, StreamType } from '../types';
import axios from 'axios';
import { fetchCategories, fetchStreamsByCategory } from '../api/streams';

function describeError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 451) {
      return 'The provider refused this request (HTTP 451).\nThe subscription may be expired, or this network or country may be blocked.\nCheck the account status on the home screen, or try another server.';
    }
    if (status === 401 || status === 403) return `Access denied by the server (HTTP ${status}). Check the account.`;
    if (status) return `Server error (HTTP ${status}). Try another server.`;
    if (err.code === 'ECONNABORTED') return 'The server took too long to answer. Try another server.';
    return 'Cannot reach the server. Check the connection, or try another server.';
  }
  return err instanceof Error ? err.message : fallback;
}

type CategoryMap = Record<StreamType, Category[]>;

interface StreamStore {
  categories: CategoryMap;
  streams: Record<string, Stream[]>; // key: `${type}:${categoryId}`
  loadingCategories: boolean;
  loadingStreams: boolean;
  error: string | null;
  /** Last stream opened in the player (also after zapping), focused again on return to the list. */
  lastPlayedId: string | null;
  setLastPlayed: (id: string) => void;

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
  lastPlayedId: null,
  setLastPlayed: (id) => set({ lastPlayedId: id }),

  loadCategories: async (type) => {
    if (get().categories[type].length > 0) return; // cached
    set({ loadingCategories: true, error: null });
    try {
      const categories = await fetchCategories(type);
      set((s) => ({ categories: { ...s.categories, [type]: categories } }));
    } catch (err: unknown) {
      set({ error: describeError(err, 'Failed to load categories') });
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
      set({ error: describeError(err, 'Failed to load streams') });
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
