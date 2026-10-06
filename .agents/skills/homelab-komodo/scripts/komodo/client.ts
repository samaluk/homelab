import { ensureLocalStorage } from "./polyfill.ts";

ensureLocalStorage();

const { KomodoClient } = await import("komodo_client");

export type KomodoEnv = {
  url: string;
  key: string;
  secret: string;
};

export function loadKomodoEnv(): KomodoEnv {
  const injected = {
    url: process.env.KOMODO_URL,
    key: process.env.KOMODO_API_KEY,
    secret: process.env.KOMODO_API_SECRET,
  };
  if (!injected.url || !injected.key || !injected.secret) {
    throw new Error(
      "The process environment must define KOMODO_URL, KOMODO_API_KEY, and KOMODO_API_SECRET together. " +
        "Load them through Infisical and Varlock with bun run komodo.",
    );
  }
  return {
    url: injected.url.replace(/\/$/, ""),
    key: injected.key,
    secret: injected.secret,
  };
}

export function createKomodoClient(env = loadKomodoEnv()) {
  return KomodoClient(env.url, {
    type: "api-key",
    params: { key: env.key, secret: env.secret },
  });
}
