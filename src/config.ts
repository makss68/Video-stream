/**
 * App configuration.
 * Set USE_MOCK=false and API_BASE_URL to your real server in production.
 */

/** Server credentials used for automatic sign-in (no gate screen). */
export const SERVERS = [
  'http://line.dino.ws:80',
  'http://line.dino-ott.ru:80',
  'http://line.dino-ott.ru:8000',
  'http://line.din-ott.com',
  'http://line.powerdino.com:80',
  'http://line.nerdiptv.com',
  'http://line.rs4ott.com',
];

export const CREDENTIALS = {
  url: SERVERS[0],
  username: '0d55fb13a8',
  password: '8f48da343d42',
};

export const config = {
  /** Base URL for your camera management API */
  API_BASE_URL: 'https://your-camera-server.com/api',

  /**
   * When true, the app uses local mock data instead of real API calls.
   * Set to false and configure API_BASE_URL for production.
   */
  USE_MOCK: true,

  /**
   * When true, the Authorization header is forwarded to the video player
   * for stream URLs that require authentication.
   * Requires the streaming server to support Bearer token on HLS requests.
   */
  STREAM_AUTH_HEADERS: true,

  /** Timeout in ms for API requests */
  REQUEST_TIMEOUT: 10_000,
};
