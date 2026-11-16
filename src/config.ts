/**
 * App configuration: provider servers and the credential sets offered in the app.
 */

/** Xtream servers of the provider, in fallback order. */
export const SERVERS = [
  'http://line.dino.ws:80',
  'http://line.dino-ott.ru:80',
  'http://line.dino-ott.ru:8000',
  'http://line.din-ott.com',
  'http://line.powerdino.com:80',
  'http://line.nerdiptv.com',
  'http://line.rs4ott.com',
];

/** One subscription (line). The app signs in automatically with the selected set. */
export interface CredentialSet {
  /** Stable key, used to remember the selection and the server picked for it. Never rename. */
  id: string;
  /** Name shown in the account picker. */
  label: string;
  username: string;
  password: string;
  /** Servers this line can use; the first one is the default. */
  servers: string[];
}

/**
 * Credential sets offered in the account picker (home screen, "Account" badge).
 * A set with an empty username or password shows as "Not configured" and can't be picked.
 */
export const CREDENTIAL_SETS: CredentialSet[] = [
  {
    id: 'main',
    label: 'Mine',
    username: '0d55fb13a8',
    password: '8f48da343d42',
    servers: SERVERS,
  },
  {
    // Placeholder: fill in username and password to enable it.
    // Replace `servers` if this line belongs to another provider.
    id: 'second',
    label: 'Second account',
    username: '',
    password: '',
    servers: SERVERS,
  },
];

/** Used on first launch, or when the remembered set is gone or not configured. */
export const DEFAULT_CREDENTIAL_SET_ID = 'main';

export function isConfigured(set: CredentialSet): boolean {
  return Boolean(set.username && set.password && set.servers.length > 0);
}

export function findCredentialSet(id: string | null | undefined): CredentialSet | undefined {
  return CREDENTIAL_SETS.find((s) => s.id === id);
}
