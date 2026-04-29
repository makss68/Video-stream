import { Platform } from 'react-native';

/** On web (HTTPS), route http: URLs through the server-side proxy to avoid mixed-content blocks. */
export function toProxyUrl(url: string): string {
  if (Platform.OS === 'web' && url.startsWith('http:')) {
    return `/api/stream?url=${encodeURIComponent(url)}`;
  }
  return url;
}
