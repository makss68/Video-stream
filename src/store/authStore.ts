import { create } from 'zustand';
import { storage } from '../utils/storage';
import { Credentials } from '../types';
import {
  CREDENTIAL_SETS,
  DEFAULT_CREDENTIAL_SET_ID,
  SERVERS,
  CredentialSet,
  findCredentialSet,
  isConfigured,
} from '../config';

const LAST_URL_KEY = 'sv_last_url';
const LAST_USERNAME_KEY = 'sv_last_username';
/** Active account: a credential set id, MANUAL_ACCOUNT_ID or SIGNED_OUT. Missing on first launch. */
const ACCOUNT_KEY = 'sv_account';
/** Credentials typed on the login screen (the "manual" account). */
const MANUAL_CREDS_KEY = 'sv_manual_creds';
/** Before credential sets existed, the picked server was stored here (for the main set). */
const LEGACY_SERVER_KEY = 'sv_server';
// SecureStore keys may only contain letters, digits, '.', '-' and '_'.
const serverKey = (accountId: string) => `sv_server_${accountId}`;

/** Account id of credentials entered on the login screen. Not a config.ts set id. */
export const MANUAL_ACCOUNT_ID = 'manual';
/** Stored in ACCOUNT_KEY after a sign-out, so the next launch shows the login screen. */
const SIGNED_OUT = 'signed_out';

interface AuthStore extends Credentials {
  /** Id of the active account: a set from CREDENTIAL_SETS (config.ts) or MANUAL_ACCOUNT_ID. */
  accountId: string;
  /** Servers of the active account. */
  servers: string[];
  /** Credentials entered on the login screen, kept until sign-out. */
  manual: Credentials | null;
  lastUrl: string; // persists across sign-outs to pre-fill the login form
  lastUsername: string; // same, for the username field
  isAuthenticated: boolean;
  isHydrating: boolean;

  hydrate: () => Promise<void>;
  /** Sign in with credentials typed on the login screen (already validated). */
  setAuth: (creds: Credentials) => Promise<void>;
  /** Sign in with / switch to a configured credential set (or the manual account), on the server last picked for it. */
  setAccount: (accountId: string) => Promise<void>;
  /** Switch the active server (same credentials) and remember the choice. */
  setServer: (url: string) => Promise<void>;
  /** Sign out and show the login screen, also on the next launch. */
  logout: () => Promise<void>;
}

async function safeGet(key: string): Promise<string | null> {
  try { return await storage.get(key); } catch { return null; }
}

async function safeSet(key: string, value: string): Promise<void> {
  try { await storage.set(key, value); } catch { /* not persisted; still applied */ }
}

async function safeRemove(key: string): Promise<void> {
  try { await storage.remove(key); } catch { /* ignore */ }
}

function parseCreds(raw: string | null): Credentials | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return c && c.url && c.username && c.password ? { url: c.url, username: c.username, password: c.password } : null;
  } catch {
    return null;
  }
}

/** A typed URL that is one of the provider's servers can fall back to all of them. */
function serversForUrl(url: string): string[] {
  return SERVERS.includes(url) ? SERVERS : [url];
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

function manualState(creds: Credentials) {
  return {
    accountId: MANUAL_ACCOUNT_ID,
    servers: serversForUrl(creds.url),
    ...creds,
    lastUrl: creds.url,
    lastUsername: creds.username,
  };
}

function defaultSet(): CredentialSet | undefined {
  const preferred = findCredentialSet(DEFAULT_CREDENTIAL_SET_ID);
  if (preferred && isConfigured(preferred)) return preferred;
  return CREDENTIAL_SETS.find(isConfigured);
}

const signedOut = { accountId: '', servers: [], url: '', username: '', password: '', isAuthenticated: false };

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...signedOut,
  manual: null,
  lastUrl: '',
  lastUsername: '',
  isHydrating: true,

  hydrate: async () => {
    const [accountKey, manualRaw, lastUrl, lastUsername] = await Promise.all([
      safeGet(ACCOUNT_KEY),
      safeGet(MANUAL_CREDS_KEY),
      safeGet(LAST_URL_KEY),
      safeGet(LAST_USERNAME_KEY),
    ]);
    const manual = parseCreds(manualRaw);
    const remembered = { manual, lastUrl: lastUrl ?? '', lastUsername: lastUsername ?? '' };

    if (accountKey === MANUAL_ACCOUNT_ID && manual) {
      set({ ...remembered, ...manualState(manual), isAuthenticated: true, isHydrating: false });
      return;
    }

    // Signed out, or nothing usable in config.ts: show the login screen.
    const fromConfig = findCredentialSet(accountKey);
    const account = fromConfig && isConfigured(fromConfig) ? fromConfig : defaultSet();
    if (accountKey === SIGNED_OUT || !account) {
      set({ ...remembered, ...signedOut, isHydrating: false });
      return;
    }

    // First launch or a configured set: sign in automatically.
    const url = await savedServerFor(account);
    set({ ...remembered, ...stateFor(account, url), isAuthenticated: true, isHydrating: false });
  },

  setAuth: async (creds) => {
    await Promise.all([
      safeSet(MANUAL_CREDS_KEY, JSON.stringify(creds)),
      safeSet(ACCOUNT_KEY, MANUAL_ACCOUNT_ID),
      safeSet(LAST_URL_KEY, creds.url),
      safeSet(LAST_USERNAME_KEY, creds.username),
    ]);
    set({ ...manualState(creds), manual: creds, isAuthenticated: true });
  },

  setAccount: async (accountId) => {
    if (accountId === MANUAL_ACCOUNT_ID) {
      const { manual } = get();
      if (!manual) return;
      await safeSet(ACCOUNT_KEY, MANUAL_ACCOUNT_ID);
      set({ ...manualState(manual), isAuthenticated: true });
      return;
    }
    const account = findCredentialSet(accountId);
    if (!account || !isConfigured(account)) return;
    const url = await savedServerFor(account);
    await safeSet(ACCOUNT_KEY, account.id);
    set({ ...stateFor(account, url), isAuthenticated: true });
  },

  setServer: async (url) => {
    const { accountId, manual } = get();
    if (accountId === MANUAL_ACCOUNT_ID && manual) {
      const updated = { ...manual, url };
      await Promise.all([
        safeSet(MANUAL_CREDS_KEY, JSON.stringify(updated)),
        safeSet(LAST_URL_KEY, url),
      ]);
      set({ url, lastUrl: url, manual: updated });
      return;
    }
    await safeSet(serverKey(accountId), url);
    set({ url, lastUrl: url });
  },

  logout: async () => {
    // Forget the typed password but keep the URL (and typed username) to pre-fill the form.
    const { url, accountId, username } = get();
    await Promise.all([
      safeRemove(MANUAL_CREDS_KEY),
      safeSet(ACCOUNT_KEY, SIGNED_OUT),
      url ? safeSet(LAST_URL_KEY, url) : Promise.resolve(),
    ]);
    set({
      ...signedOut,
      manual: null,
      lastUrl: url || get().lastUrl,
      lastUsername: accountId === MANUAL_ACCOUNT_ID ? username : get().lastUsername,
    });
  },
}));
