/**
 * App configuration.
 * Set USE_MOCK=false and API_BASE_URL to your real server in production.
 */

/**
 * AES-encrypted credentials (key = gate password entered at runtime).
 * Never store plaintext credentials here.
 */
export const ENCRYPTED_CREDENTIALS =
  'U2FsdGVkX1/uSsMHMtyNBJIWL807DyTsUOpUD74n8Z0KcJAQ2elzIiYaosM+/VsuwQ0no2VsQTkovUW7u3yZ2RRVH4GtDFJwRNjaer/l7Ui/LmmzX9nhKDp4E2s1j+U2wiaSCPyMZZCLL9YrY07lEg==';

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
