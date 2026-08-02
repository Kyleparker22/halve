import { createMMKV, type MMKV } from 'react-native-mmkv';

/** Scorecard state and the outbox. Survives a force-quit on the 14th tee. */
export const scoreStore = createMMKV({ id: 'halve.scores' });

/** TanStack Query cache. Disposable — never the source of truth for a score. */
export const queryStore = createMMKV({ id: 'halve.query' });

/** Small user preferences. */
export const prefsStore = createMMKV({ id: 'halve.prefs' });

export function readJson<T>(store: MMKV, key: string, fallback: T): T {
  const raw = store.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(store: MMKV, key: string, value: unknown): void {
  store.set(key, JSON.stringify(value));
}
