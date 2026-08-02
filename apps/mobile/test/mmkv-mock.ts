/**
 * In-memory stand-in for react-native-mmkv so the offline scorecard logic can
 * be tested in Node. Same surface the app uses: getString, set, remove.
 */
export interface MMKV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
  clearAll(): void;
}

const instances = new Map<string, Map<string, string>>();

export function createMMKV(config?: { id?: string }): MMKV {
  const id = config?.id ?? 'default';
  if (!instances.has(id)) instances.set(id, new Map());
  const store = instances.get(id)!;

  return {
    getString: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => store.delete(key),
    clearAll: () => store.clear(),
  };
}

/** Test helper: wipe every instance between tests. */
export function __resetAll(): void {
  for (const store of instances.values()) store.clear();
}
