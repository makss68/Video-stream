import { Platform } from 'react-native';

// Only proxy when the page is served over HTTPS — that's the only case where the
// browser's mixed-content block kicks in. On HTTP localhost (Expo dev server) the
// browser allows direct HTTP calls and the proxy endpoint doesn't exist anyway.
const isHttpsWeb =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location?.protocol === 'https:';

export function shouldUseProxy(): boolean {
  return isHttpsWeb;
}

/** Route http: URLs through the server-side relay when needed (HTTPS web only). */
export function toProxyUrl(url: string): string {
  if (isHttpsWeb && url.startsWith('http:')) {
    return `/api/stream?url=${encodeURIComponent(url)}`;
  }
  return url;
}
