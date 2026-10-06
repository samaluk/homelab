import { afterEach, beforeEach, expect, test } from "bun:test";
import { createKomodoClient, loadKomodoEnv } from "./client.ts";

const names = ["KOMODO_URL", "KOMODO_API_KEY", "KOMODO_API_SECRET"] as const;
let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
});

afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

test("injected credentials work without a local env file", () => {
  process.env.KOMODO_URL = "https://komodo.example.invalid/";
  process.env.KOMODO_API_KEY = "test-api-key";
  process.env.KOMODO_API_SECRET = "test-api-secret";

  expect(loadKomodoEnv()).toEqual({
    url: "https://komodo.example.invalid",
    key: "test-api-key",
    secret: "test-api-secret",
  });
});

test("incomplete injected credentials fail without falling back to another source", () => {
  process.env.KOMODO_API_SECRET = "test-api-secret";
  expect(loadKomodoEnv).toThrow(
    "The process environment must define KOMODO_URL, KOMODO_API_KEY, and KOMODO_API_SECRET together.",
  );
  process.env.KOMODO_URL = "https://komodo.example.invalid";
  process.env.KOMODO_API_KEY = "";
  expect(loadKomodoEnv).toThrow("The process environment must define");
});

test("an explicit client configuration needs no ambient credentials", () => {
  const client = createKomodoClient({
    url: "https://komodo.example.invalid",
    key: "test-api-key",
    secret: "test-api-secret",
  });
  expect(typeof client.read).toBe("function");
});
