import { expect, test } from "bun:test";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../../..");
const credentials = {
  KOMODO_URL: "https://komodo.example.invalid",
  KOMODO_API_KEY: "test-komodo-key-for-redaction",
  KOMODO_API_SECRET: "test-komodo-secret-for-redaction",
};

function run(env: Record<string, string | undefined>, script: string) {
  const result = Bun.spawnSync({
    cmd: [
      resolve(repoRoot, "node_modules/.bin/varlock"),
      "run", "--path", import.meta.dir, "--inject", "vars",
      "--", process.execPath, "-e", script,
    ],
    cwd: repoRoot,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

test("invalid URL prevents the client from starting", () => {
  const result = run(
    { ...process.env, ...credentials, KOMODO_URL: "invalid-url" },
    'console.log("CHILD_STARTED")',
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.output).not.toContain("CHILD_STARTED");
});

test("missing secret prevents the client from starting", () => {
  const env: Record<string, string | undefined> = { ...process.env, ...credentials };
  delete env.KOMODO_API_SECRET;
  const result = run(env, 'console.log("CHILD_STARTED")');
  expect(result.exitCode).not.toBe(0);
  expect(result.output).not.toContain("CHILD_STARTED");
});

test("captured client stdout and stderr redact the API credentials", () => {
  const result = run(
    { ...process.env, ...credentials },
    'console.log("CHILD_STARTED", process.env.KOMODO_API_KEY); console.error(process.env.KOMODO_API_SECRET)',
  );
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("CHILD_STARTED");
  expect(result.output).not.toContain(credentials.KOMODO_API_KEY);
  expect(result.output).not.toContain(credentials.KOMODO_API_SECRET);
});
