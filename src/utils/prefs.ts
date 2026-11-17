/**
 * Small JSON documents (favorites, history) — web implementation, uses localStorage.
 * Metro prefers prefs.native.ts on iOS/Android. Not for secrets: see storage.ts.
 */
const key = (name: string) => `sv_${name}`;

export async function loadJSON<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJSON(name: string, value: unknown): Promise<void> {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep the in-memory state */
  }
}
