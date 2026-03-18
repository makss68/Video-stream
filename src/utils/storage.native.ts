/**
 * Native implementation — uses expo-secure-store (device keychain).
 * Metro resolves this file on iOS/Android, storage.ts on web.
 */
import * as SecureStore from 'expo-secure-store';

export const storage = {
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
