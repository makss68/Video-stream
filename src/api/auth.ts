import axios from 'axios';
import { ApiCategory } from '../types';
import { shouldUseProxy } from '../utils/proxy';

/**
 * Validates credentials by calling get_live_categories.
 * Throws with a user-friendly message on failure.
 */
export async function validateCredentials(
  url: string,
  username: string,
  password: string,
): Promise<void> {
  const cleanUrl = url.trim().replace(/\/+$/, '');

  // On HTTPS web, route through the server-side proxy to avoid mixed-content blocks.
  // On HTTP localhost or native, hit the IPTV server directly.
  const useProxy = shouldUseProxy();
  const endpoint = useProxy ? '/api/proxy' : `${cleanUrl}/player_api.php`;
  const params = useProxy
    ? { serverUrl: cleanUrl, username, password, action: 'get_live_categories' }
    : { username, password, action: 'get_live_categories' };

  let data: unknown;
  try {
    const res = await axios.get<ApiCategory[]>(endpoint, {
      params,
      timeout: 15_000,
    });
    data = res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const code = err.code ?? 'unknown';
      const status = err.response?.status;
      if (err.code === 'ECONNABORTED') {
        throw new Error(`Timed out connecting to:\n${endpoint}`);
      }
      if (status === 401 || status === 403) {
        throw new Error('Invalid credentials (wrong username or password)');
      }
      if (status === 451) {
        throw new Error('The provider refused this line (HTTP 451).\nThe subscription may be expired, or this network or country may be blocked.');
      }
      if (status) {
        throw new Error(`Server returned HTTP ${status}\n${endpoint}`);
      }
      throw new Error(`Cannot reach server [${code}]\n${endpoint}\n\nCheck URL and make sure the server is accessible from this network.`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error: ${msg}\n${endpoint}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Invalid credentials or unsupported server');
  }
}

/** Subscription state, from the user_info block of an action-less player_api call. */
export interface AccountInfo {
  /** Provider status, e.g. 'Active', 'Expired', 'Banned', 'Disabled'. */
  status: string;
  /** Expiry date, or null for lines that never expire. */
  expiresAt: Date | null;
  maxConnections: number | null;
  activeConnections: number | null;
}

export interface PingResult {
  ok: boolean;
  /** Round-trip time of an authenticated player_api call, in ms. */
  ms: number;
  error?: string;
  account?: AccountInfo;
}

function toAccountInfo(userInfo: any): AccountInfo {
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const exp = num(userInfo?.exp_date);
  return {
    status: String(userInfo?.status ?? 'Unknown'),
    expiresAt: exp ? new Date(exp * 1000) : null,
    maxConnections: num(userInfo?.max_connections),
    activeConnections: num(userInfo?.active_cons),
  };
}

/**
 * Measures how fast a server answers an authenticated (action-less) player_api
 * call. A server only counts as ok if it accepts the credentials and the line is
 * Active: an expired line still authenticates but every content call fails (HTTP 451).
 */
export async function pingServer(
  url: string,
  username: string,
  password: string,
  timeout = 6_000,
): Promise<PingResult> {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const useProxy = shouldUseProxy();
  const endpoint = useProxy ? '/api/proxy' : `${cleanUrl}/player_api.php`;
  const params = useProxy
    ? { serverUrl: cleanUrl, username, password }
    : { username, password };

  const start = Date.now();
  try {
    const res = await axios.get(endpoint, { params, timeout });
    const ms = Date.now() - start;
    const userInfo = res.data?.user_info;
    const auth = userInfo?.auth;
    if (auth === 1 || auth === '1') {
      const account = toAccountInfo(userInfo);
      if (account.status !== 'Active') return { ok: false, ms, error: account.status, account };
      return { ok: true, ms, account };
    }
    const msg = typeof res.data === 'string' ? res.data.slice(0, 40) : undefined;
    return { ok: false, ms, error: msg || 'Rejected' };
  } catch (err) {
    const ms = Date.now() - start;
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') return { ok: false, ms, error: 'Timeout' };
      if (err.response?.status) {
        const detail = (err.response.data as any)?.error;
        const cause = typeof detail === 'string' ? detail.match(/\(([^)]+)\)\s*$/)?.[1] : undefined;
        return { ok: false, ms, error: cause ?? `HTTP ${err.response.status}` };
      }
    }
    return { ok: false, ms, error: 'Unreachable' };
  }
}

/** Status of the line on one server; null when the server can't be reached or rejects the login. */
export async function fetchAccountInfo(url: string, username: string, password: string): Promise<AccountInfo | null> {
  const result = await pingServer(url, username, password, 10_000);
  return result.account ?? null;
}
