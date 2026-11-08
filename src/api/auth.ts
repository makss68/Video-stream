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

export interface PingResult {
  ok: boolean;
  /** Round-trip time of an authenticated player_api call, in ms. */
  ms: number;
  error?: string;
}

/**
 * Measures how fast a server answers an authenticated (action-less) player_api
 * call. A server only counts as ok if it accepts the credentials.
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
    const auth = res.data?.user_info?.auth;
    if (auth === 1 || auth === '1') return { ok: true, ms };
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
