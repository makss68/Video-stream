/**
 * Template for src/config.local.ts, the private file with the servers and logins
 * built into the app. `npm install` copies this file there when it is missing;
 * then fill in the copy. src/config.local.ts is git-ignored: never commit it.
 * Shape and rules: CredentialSet in src/config.ts.
 */
import type { CredentialSet } from './config';

/** Xtream servers of the provider, in fallback order. */
export const SERVERS: string[] = [
  // 'http://your-server.example:80',
];

/**
 * Credential sets offered in the account picker (home screen, "Account" badge)
 * and on the login screen. Ids must be unique and never renamed.
 * A set with an empty username or password shows as "Not configured" and can't be picked.
 * With no configured set, the app opens on the login screen.
 */
export const CREDENTIAL_SETS: CredentialSet[] = [
  { id: 'main', label: 'Main', username: '', password: '', servers: SERVERS },
  { id: 'second', label: 'Second', username: '', password: '', servers: SERVERS },
  { id: 'third', label: 'Third', username: '', password: '', servers: SERVERS },
];

/** Used on first launch, or when the remembered set is gone or not configured. */
export const DEFAULT_CREDENTIAL_SET_ID = 'main';
