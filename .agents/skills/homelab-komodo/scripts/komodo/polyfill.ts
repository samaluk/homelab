/** mogh_auth_client touches localStorage at import time; polyfill for Bun/Node CLIs. */
export function ensureLocalStorage(): void {
  if (typeof globalThis.localStorage !== "undefined") return;

  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}
