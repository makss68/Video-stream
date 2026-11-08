import { create } from 'zustand';
import { storage } from '../utils/storage';
import { Credentials } from '../types';
import { CREDENTIALS, SERVERS } from '../config';

const CREDS_KEY = 'sv_credentials';
const LAST_URL_KEY = 'sv_last_url';
const SERVER_KEY = 'sv_server';

interface AuthStore extends Credentials {
  lastUrl: string; // persists across logouts to pre-fill the login form
  isAuthenticated: boolean;
  isHydrating: boolean;

  hydrate: () => Promise<void>;
  setAuth: (creds: Credentials) => Promise<void>;
  /** Switch the active server (same credentials) and remember the choice. */
  setServer: (url: string) => Promise<void>;
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
    // Always sign in with the credentials from config.ts (no gate screen);
    // only the server may differ, if the user picked another one.
    let saved: string | null = null;
    try { saved = await storage.get(SERVER_KEY); } catch { /* use default */ }
    const url = saved && SERVERS.includes(saved) ? saved : CREDENTIALS.url;
    set({ ...CREDENTIALS, url, lastUrl: url, isAuthenticated: true, isHydrating: false });
  },

  setAuth: async (creds) => {
    await Promise.all([
      storage.set(CREDS_KEY, JSON.stringify(creds)),
      storage.set(LAST_URL_KEY, creds.url), // keep URL even after logout
    ]);
    set({ ...creds, lastUrl: creds.url, isAuthenticated: true });
  },

  setServer: async (url) => {
    await storage.set(SERVER_KEY, url);
    set({ url, lastUrl: url });
  },

  logout: async () => {
    // Remove session but keep lastUrl for convenience
    await storage.remove(CREDS_KEY);
    set({ url: '', username: '', password: '', isAuthenticated: false });
  },
}));
