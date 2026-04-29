import CryptoJS from 'crypto-js';
import { Credentials } from '../types';

export function decryptCredentials(encryptedBlob: string, key: string): Credentials {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedBlob, key);
    const plain = bytes.toString(CryptoJS.enc.Utf8);
    if (!plain) throw new Error();
    return JSON.parse(plain) as Credentials;
  } catch {
    throw new Error('Wrong password');
  }
}
