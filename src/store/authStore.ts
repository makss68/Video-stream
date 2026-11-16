import { create } from 'zustand';
import { storage } from '../utils/storage';
import { Credentials } from '../types';
import {
  CREDENTIAL_SETS,
  DEFAULT_CREDENTIAL_SET_ID,
  CredentialSet,
  findCredentialSet,
  isConfigured,
} from '../config';

const CREDS_KEY = 'sv_credentials';
const LAST_URL_KEY = 'sv_last_url';
const ACCOUNT_KEY = 'sv_account';
/** Before credential sets existed, the picked server was stored here (for the main set). */
const LEGACY_SERVER_KEY = 'sv_server';
// SecureStore keys may only contain letters, digits, '.', '-' and '_'.
const serverKey = (accountId: string) => `sv_server_${accountId}`;

interface AuthStore extends Credentials {
  /** Id of the active credential set (see CREDENTIAL_SETS in config.ts). */
  accountId: string;
  /** Servers of the active credential set. */
  servers: string[];
  lastUrl: string; // persists across logouts to pre-fill the login form
  isAuthenticated: boolean;
  isHydrating: boolean;

  hydrate: () => Promise<void>;
  setAuth: (creds: Credentials) => Promise<void>;
  /** Switch to another configured credential set, on the server last picked for it. */
  setAccount: (accountId: string) => Promise<void>;
  /** Switch the active server (same credentials) and remember the choice. */
  setServer: (url: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function safeGet(key: string): Promise<string | null> {
  try { return await storage.get(key); } catch { return null; }
}

async function safeSet(key: string, value: string): Promise<void> {
  try { await storage.set(key, value); } catch { /* not persisted; still applied */ }
}

/** The server remembered for this set, if it still belongs to it, else its first server. */
async function savedServerFor(set: CredentialSet): Promise<string> {
  let saved = await safeGet(serverKey(set.id));
  if (!saved && set.id === DEFAULT_CREDENTIAL_SET_ID) saved = await safeGet(LEGACY_SERVER_KEY);
  return saved && set.servers.includes(saved) ? saved : set.servers[0];
}

function stateFor(set: CredentialSet, url: string) {
  return {
    accountId: set.id,
    servers: set.servers,
    username: set.username,
    password: set.password,
    url,
    lastUrl: url,
  };
}

function defaultSet(): CredentialSet {
  const preferred = findCredentialSet(DEFAULT_CREDENTIAL_SET_ID);
  if (preferred && isConfigured(preferred)) return preferred;
  return CREDENTIAL_SETS.find(isConfigured) ?? CREDENTIAL_SETS[0];
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  accountId: '',
  servers: [],
  url: '',
  username: '',
  password: '',
  lastUrl: '',
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    // Always sign in with a credential set from config.ts (no gate screen).
    const remembered = findCredentialSet(await safeGet(ACCOUNT_KEY));
    const account = remembered && isConfigured(remembered) ? remembered : defaultSet();
    const url = await savedServerFor(account);
    set({ ...stateFor(account, url), isAuthenticated: true, isHydrating: false });
  },

  setAuth: async (creds) => {
    await Promise.all([
      storage.set(CREDS_KEY, JSON.stringify(creds)),
      storage.set(LAST_URL_KEY, creds.url), // keep URL even after logout
    ]);
    set({ ...creds, lastUrl: creds.url, isAuthenticated: true });
  },

  setAccount: async (accountId) => {
    const account = findCredentialSet(accountId);
    if (!account || !isConfigured(account)) return;
    const url = await savedServerFor(account);
    await safeSet(ACCOUNT_KEY, account.id);
    set(stateFor(account, url));
  },

  setServer: async (url) => {
    await safeSet(serverKey(get().accountId), url);
    set({ url, lastUrl: url });
  },

  logout: async () => {
    // Remove session but keep lastUrl for convenience
    await storage.remove(CREDS_KEY);
    set({ url: '', username: '', password: '', isAuthenticated: false });
  },
}));
