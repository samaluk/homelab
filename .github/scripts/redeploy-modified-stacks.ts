#!/usr/bin/env bun
/**
 * Redeploy Komodo stacks whose watched files changed in the triggering push.
 *
 * Replaces the Komodo Action "ad-hoc: redeploy modified stacks". Komodo Actions
 * run Deno inside komodo-core, which aborts with `getentropy failed` on this
 * Synology host's 3.10.x kernel (no getrandom(2) syscall). The Komodo deploy
 * API itself is fine — only Action *execution* is broken — so this runs from a
 * modern kernel (GitHub Actions / local Bun) and drives Komodo over its API.
 *
 * Behavior:
 *   - Push trigger: the workflow passes the list of changed files (newline- or
 *     NUL-separated) in CHANGED_FILES. Only stacks whose watched files appear
 *     in that diff are queued for DeployStackIfChanged. The summary reports the
 *     changed files per stack, so it reflects what actually happened.
 *   - Schedule / workflow_dispatch: no single diff is available, so CHANGED_FILES
 *     is empty and every non-excluded stack is queued as a drift reconciliation
 *     (Komodo's DeployStackIfChanged still no-ops stacks that haven't changed).
 *
 * Watched files for a stack = its `run_directory` joined with each `file_paths`
 * entry (default `compose.yaml` when file_paths is empty), plus any
 * `config_files[].path`. This mirrors the diff Komodo itself uses in
 * DeployStackIfChanged.
 *
 * Env (required): KOMODO_URL, KOMODO_API_KEY, KOMODO_API_SECRET
 * Env (optional): KOMODO_EXCLUSION_TAG (default: "template")
 *                 CHANGED_FILES (changed paths from the push; newline- or NUL-separated)
 *                 KOMODO_DRY_RUN ("1" to log without deploying)
 *
 * Uses fire-and-forget `execute`: Komodo's /execute response carries no update
 * `_id`, so the client's poll helper returns immediately without polling. We
 * hand the deploy to Komodo and trust DeployStackIfChanged to apply it.
 */
import { appendFile } from "node:fs/promises";
import { ensureLocalStorage } from "../../.agents/skills/homelab-komodo/scripts/komodo/polyfill.ts";

ensureLocalStorage();

const { KomodoClient } = await import("komodo_client");

const url = process.env.KOMODO_URL?.replace(/\/$/, "");
const key = process.env.KOMODO_API_KEY;
const secret = process.env.KOMODO_API_SECRET;
if (!url || !key || !secret) {
  console.error(
    "Missing KOMODO_URL / KOMODO_API_KEY / KOMODO_API_SECRET in the environment.",
  );
  process.exit(1);
}

const exclusionTagName = process.env.KOMODO_EXCLUSION_TAG?.trim() || "template";
const dryRun = process.env.KOMODO_DRY_RUN === "1";

const changedFiles = (process.env.CHANGED_FILES ?? "")
  .split(/[\n\0]/)
  .map((p) => p.trim())
  .filter(Boolean);
const driftMode = changedFiles.length === 0;
const changedSet = new Set(changedFiles);

const komodo = KomodoClient(url, {
  type: "api-key",
  params: { key, secret },
});

interface StackTarget {
  name: string;
  id: string;
  watched: string[];
  changed: string[];
}

const skipped: string[] = [];
const targets: StackTarget[] = [];
const queued: string[] = [];
const failed: { name: string; error: string }[] = [];

console.log(`Komodo: ${url}`);
console.log(`Exclusion tag: "${exclusionTagName}"${dryRun ? "  (DRY RUN)" : ""}`);
console.log(
  driftMode
    ? "Mode: drift (no push diff supplied — queueing every non-excluded stack)\n"
    : `Mode: diff (${changedFiles.length} changed file(s))\n`,
);

// GetTag throws if the tag name is not found. Fail closed so a typo never
// silently deploys templates.
let exclusionTagId: string | null = null;
try {
  const tag = await komodo.read("GetTag", { tag: exclusionTagName });
  exclusionTagId = tag?._id?.$oid ?? null;
} catch (err) {
  const msg =
    err && typeof err === "object" && "result" in err
      ? JSON.stringify((err as { result?: unknown }).result)
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`Could not resolve exclusion tag "${exclusionTagName}": ${msg}`);
  console.error("Refusing to deploy without a working exclusion filter. Aborting.");
  process.exit(2);
}
if (!exclusionTagId) {
  console.error(`Exclusion tag "${exclusionTagName}" has no _id.$oid. Aborting.`);
  process.exit(2);
}
console.log(`Exclusion tag id: ${exclusionTagId}\n`);

const stacks = await komodo.read("ListStacks", {});
console.log(`Found ${stacks.length} stack(s).`);

for (const stack of stacks) {
  const { name, id, tags } = stack;
  if (tags.includes(exclusionTagId)) {
    console.log(`Skipping  ${name} (excluded)`);
    skipped.push(name);
    continue;
  }

  // Resolve watched paths from the stack config (mirrors Komodo's diff).
  const cfg = (await komodo.read("GetStack", { stack: id })).config;
  const runDir = (cfg.run_directory ?? "").replace(/^\.\/+/, "");
  const composeFiles =
    cfg.file_paths && cfg.file_paths.length > 0 ? cfg.file_paths : ["compose.yaml"];
  const watched = [
    ...composeFiles,
    ...(cfg.config_files ?? []).map((f) => f.path).filter(Boolean),
  ]
    .map((p) => normalizeRepoPath(runDir, p))
    .filter(Boolean);

  const changed = driftMode
    ? watched // in drift mode every watched file is treated as "in scope"
    : watched.filter((p) => changedSet.has(p) || [...changedSet].some((c) => c.startsWith(`${p}/`)));

  if (!driftMode && changed.length === 0) {
    console.log(`Unchanged ${name} — no watched file in diff`);
    continue;
  }

  targets.push({ name, id, watched, changed });
}

console.log("");
if (targets.length === 0) {
  console.log("No stacks to deploy.");
} else {
  console.log(`${targets.length} stack(s) to deploy:\n`);
}

for (const t of targets) {
  const label = driftMode ? t.name : `${t.name}  [${t.changed.join(", ")}]`;
  if (dryRun) {
    console.log(`Would deploy ${label}`);
    continue;
  }
  console.log(`Deploying ${label}`);
  try {
    await komodo.execute("DeployStackIfChanged", { stack: t.id });
    console.log(`  -> queued`);
    queued.push(t.name);
  } catch (err) {
    const msg =
      err && typeof err === "object" && "result" in err
        ? JSON.stringify((err as { result?: unknown }).result)
        : err instanceof Error
          ? err.message
          : String(err);
    console.log(`  -> FAILED: ${msg}`);
    failed.push({ name: t.name, error: msg });
  }
}

console.log("");
const headline = dryRun ? `${targets.length} would deploy` : `${queued.length} queued`;
const unchangedCount = stacks.length - skipped.length - targets.length;
console.log(
  `Summary: ${headline}, ${unchangedCount} unchanged, ${skipped.length} skipped, ${failed.length} failed`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines: string[] = [];
  lines.push(`### Komodo redeploy`);
  lines.push("");
  lines.push(`- Trigger: ${process.env.GITHUB_EVENT_NAME ?? "manual"}`);
  lines.push(`- Exclusion tag: \`${exclusionTagName}\` (\`${exclusionTagId}\`)`);
  lines.push(`- Mode: ${driftMode ? "drift (no push diff)" : `diff (${changedFiles.length} changed file(s))`}`);
  const countLine = dryRun
    ? `- Would deploy: **${targets.length}** · Unchanged: **${stacks.length - skipped.length - targets.length}** · Skipped: **${skipped.length}** · Failed: **${failed.length}**`
    : `- Queued: **${queued.length}** · Unchanged: **${stacks.length - skipped.length - targets.length}** · Skipped: **${skipped.length}** · Failed: **${failed.length}**`;
  lines.push(countLine);

  if (changedFiles.length) {
    lines.push(`\n**Changed files in push:**`);
    for (const f of changedFiles) lines.push(`- \`${f}\``);
  }
  if (targets.length) {
    lines.push(`\n**${dryRun ? "Would deploy" : "Queued"}:**`);
    lines.push("| Stack | Changed file(s) |");
    lines.push("|---|---|");
    const sanitize = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
    for (const t of targets) {
      lines.push(`| ${sanitize(t.name)} | ${driftMode ? "_(drift)_" : sanitize(t.changed.join(", "))} |`);
    }
  }
  if (skipped.length) lines.push(`\n**Skipped (excluded):** ${skipped.join(", ")}`);
  if (failed.length) {
    lines.push(`\n**Failed:**`);
    lines.push("| Stack | Error |");
    lines.push("|---|---|");
    const sanitize = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
    for (const f of failed) lines.push(`| ${sanitize(f.name)} | ${sanitize(f.error)} |`);
  }
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n", "utf8");
}

if (failed.length > 0) process.exit(1);

function normalizeRepoPath(runDir: string, file: string): string {
  const f = file.replace(/^\.\/+/, "").trim();
  if (!f) return "";
  if (!runDir) return f;
  if (f.startsWith("/")) return f.replace(/^\/+/, "");
  return `${runDir.replace(/\/+$/, "")}/${f}`;
}
