/**
 * App configuration.
 * Set USE_MOCK=false and API_BASE_URL to your real server in production.
 */
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
