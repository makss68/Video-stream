import { create } from 'zustand';
import { storage } from '../utils/storage';
import { Credentials } from '../types';

const CREDS_KEY = 'sv_credentials';
const LAST_URL_KEY = 'sv_last_url';

interface AuthStore extends Credentials {
  lastUrl: string; // persists across logouts to pre-fill the login form
  isAuthenticated: boolean;
  isHydrating: boolean;

  hydrate: () => Promise<void>;
  setAuth: (creds: Credentials) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  url: '',
  username: '',
  password: '',
  lastUrl: '',
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    try {
      const [raw, lastUrl] = await Promise.all([
        storage.get(CREDS_KEY),
        storage.get(LAST_URL_KEY),
      ]);
      if (raw) {
        const creds: Credentials = JSON.parse(raw);
        set({ ...creds, lastUrl: lastUrl ?? creds.url, isAuthenticated: true });
      } else {
        set({ lastUrl: lastUrl ?? '' });
      }
    } catch {
      // Silently fail — user will be sent to login
    } finally {
      set({ isHydrating: false });
    }
  },

  setAuth: async (creds) => {
    await Promise.all([
      storage.set(CREDS_KEY, JSON.stringify(creds)),
      storage.set(LAST_URL_KEY, creds.url), // keep URL even after logout
    ]);
    set({ ...creds, lastUrl: creds.url, isAuthenticated: true });
  },

  logout: async () => {
    // Remove session but keep lastUrl for convenience
    await storage.remove(CREDS_KEY);
    set({ url: '', username: '', password: '', isAuthenticated: false });
  },
}));
