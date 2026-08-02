import * as Crypto from 'expo-crypto';

// No ambiguous characters — these codes get read aloud and typed by hand.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Short, random, non-sequential invite code. 10 chars, like the spec says. */
export function inviteCode(length = 10): string {
  const bytes = Crypto.getRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function clientId(): string {
  return Crypto.randomUUID();
}
