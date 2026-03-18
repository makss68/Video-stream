/**
 * Web implementation — uses localStorage.
 * Metro automatically prefers storage.native.ts on iOS/Android.
 */
export const storage = {
  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};
