/**
 * Small JSON documents (favorites, history) — native implementation, one file each in
 * the app's document directory. (SecureStore, used for logins, caps values at ~2 KB.)
 */
import * as FileSystem from 'expo-file-system';

const path = (name: string) => `${FileSystem.documentDirectory}${name}.json`;

// Writes to the same file are chained so a slow write can't land after a newer one.
const pending = new Map<string, Promise<void>>();

export async function loadJSON<T>(name: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path(name));
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path(name))) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(name: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value);
  const next = (pending.get(name) ?? Promise.resolve())
    .then(() => FileSystem.writeAsStringAsync(path(name), data))
    .catch(() => { /* keep the in-memory state */ });
  pending.set(name, next);
  return next;
}
