import { Platform } from 'react-native';

// Always proxy on web: the upstream sends no CORS headers (and redirects live
// streams to a bare IP), and on HTTPS pages mixed content is blocked as well.
// In production /api/* is served by Vercel, in dev by metro.config.js.
const isHttpsWeb = Platform.OS === 'web' && typeof window !== 'undefined';

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
