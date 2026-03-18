import axios from 'axios';
import { ApiCategory } from '../types';

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

  let data: unknown;
  try {
    const res = await axios.get<ApiCategory[]>(`${cleanUrl}/player_api.php`, {
      params: { username, password, action: 'get_live_categories' },
      timeout: 10_000,
    });
    data = res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') throw new Error('Connection timed out');
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new Error('Invalid credentials');
      }
      throw new Error('Cannot reach server — check the URL');
    }
    throw new Error('Network error');
  }

  if (!Array.isArray(data)) {
    throw new Error('Invalid credentials or unsupported server');
  }
}
