/**
 * App configuration: provider servers and the credential sets offered in the app.
 *
 * The values live in src/config.local.ts, which is git-ignored so logins are never
 * committed; it is still bundled into the builds made on this machine.
 * Template: src/config.local.example.ts (`npm install` copies it when the file is missing).
 */
export { SERVERS, CREDENTIAL_SETS, DEFAULT_CREDENTIAL_SET_ID } from './config.local';
import { CREDENTIAL_SETS } from './config.local';

/** One subscription (line). The app signs in automatically with the selected set. */
export interface CredentialSet {
  /** Stable key, used to remember the selection and the server picked for it. Unique; never rename. */
  id: string;
  /** Name shown in the account picker. */
  label: string;
  username: string;
  password: string;
  /** Servers this line can use; the first one is the default. */
  servers: string[];
}

export function isConfigured(set: CredentialSet): boolean {
  return Boolean(set.username && set.password && set.servers.length > 0);
}

export function findCredentialSet(id: string | null | undefined): CredentialSet | undefined {
  return CREDENTIAL_SETS.find((s) => s.id === id);
}
