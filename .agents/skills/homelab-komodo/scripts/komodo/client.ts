import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ensureLocalStorage } from "./polyfill.ts";

ensureLocalStorage();

const { KomodoClient } = await import("komodo_client");

export type KomodoEnv = {
  url: string;
  key: string;
  secret: string;
};

function findRepoRoot(): string {
  let dir = resolve(import.meta.dir);
  while (true) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      const vars = parseEnvFile(readFileSync(envPath, "utf8"));
      if (vars.KOMODO_URL && vars.KOMODO_API_KEY && vars.KOMODO_API_SECRET) {
        return dir;
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Komodo credentials not found. Set KOMODO_URL, KOMODO_API_KEY, and KOMODO_API_SECRET in the homelab repo .env file.",
  );
}

const REPO_ROOT = findRepoRoot();
const ENV_CANDIDATES = [
  resolve(REPO_ROOT, ".env"),
  resolve(REPO_ROOT, "komodo.local.env"),
  resolve(REPO_ROOT, ".env.komodo"),
];

export function loadKomodoEnv(): KomodoEnv {
  const path = ENV_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error(
      "Komodo credentials not found. Set KOMODO_URL, KOMODO_API_KEY, and KOMODO_API_SECRET in .env (repo root).",
    );
  }

  const vars = parseEnvFile(readFileSync(path, "utf8"));
  const url = vars.KOMODO_URL;
  const key = vars.KOMODO_API_KEY;
  const secret = vars.KOMODO_API_SECRET;

  if (!url || !key || !secret) {
    throw new Error(
      `${path} must define KOMODO_URL, KOMODO_API_KEY, and KOMODO_API_SECRET.`,
    );
  }

  return { url: url.replace(/\/$/, ""), key, secret };
}

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function createKomodoClient(env = loadKomodoEnv()) {
  return KomodoClient(env.url, {
    type: "api-key",
    params: { key: env.key, secret: env.secret },
  });
}
