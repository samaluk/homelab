#!/usr/bin/env bun
/**
 * Batch DeployStackIfChanged for all stacks except those tagged with an exclusion tag.
 *
 * Replaces the Komodo Action "ad-hoc: redeploy modified stacks". Komodo Actions
 * run Deno inside komodo-core, which aborts with `getentropy failed` on this
 * Synology host's 3.10.x kernel (no getrandom(2) syscall). The Komodo deploy
 * API itself is fine — only Action *execution* is broken — so this runs from a
 * modern kernel (GitHub Actions / local Bun) and drives Komodo over its API.
 *
 * Env (required): KOMODO_URL, KOMODO_API_KEY, KOMODO_API_SECRET
 * Env (optional): KOMODO_EXCLUSION_TAG (default: "template")
 *                 KOMODO_DEPLOY_POLL ("1" to wait for each deploy to finish)
 *                 KOMODO_DRY_RUN ("1" to log without deploying)
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
const poll = process.env.KOMODO_DEPLOY_POLL === "1";
const dryRun = process.env.KOMODO_DRY_RUN === "1";

const komodo = KomodoClient(url, {
  type: "api-key",
  params: { key, secret },
});

const skipped: string[] = [];
const deployed: string[] = [];
const wouldDeploy: string[] = [];
const failed: { name: string; error: string }[] = [];

console.log(`Komodo: ${url}`);
console.log(`Exclusion tag: "${exclusionTagName}"${dryRun ? "  (DRY RUN)" : ""}\n`);

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
console.log(`Found ${stacks.length} stack(s).\n`);

for (const stack of stacks) {
  const { name, id, tags } = stack;
  if (tags.includes(exclusionTagId)) {
    console.log(`Skipping  ${name} (excluded)`);
    skipped.push(name);
    continue;
  }

  if (dryRun) {
    console.log(`Would deploy ${name}`);
    wouldDeploy.push(name);
    continue;
  }

  console.log(`Deploying ${name}`);
  try {
    if (poll) {
      const result = await komodo.execute_and_poll("DeployStackIfChanged", {
        stack: id,
      });
      const status = "status" in result ? String((result as { status?: unknown }).status) : "";
      if (String(status).toLowerCase().includes("error")) {
        console.log(`  -> ERROR (${status})`);
        failed.push({ name, error: String(status) });
      } else {
        console.log(`  -> ${status || "done"}`);
        deployed.push(name);
      }
    } else {
      await komodo.execute("DeployStackIfChanged", { stack: id });
      deployed.push(name);
    }
  } catch (err) {
    const msg =
      err && typeof err === "object" && "result" in err
        ? JSON.stringify((err as { result?: unknown }).result)
        : err instanceof Error
          ? err.message
          : String(err);
    console.log(`  -> FAILED: ${msg}`);
    failed.push({ name, error: msg });
  }
}

console.log("");
const headline = dryRun
  ? `${wouldDeploy.length} would deploy`
  : `${deployed.length} deployed`;
console.log(
  `Summary: ${headline}, ${skipped.length} skipped, ${failed.length} failed`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines: string[] = [];
  lines.push(`### Komodo batch redeploy`);
  lines.push("");
  lines.push(`- Trigger: ${process.env.GITHUB_EVENT_NAME ?? "manual"}`);
  lines.push(`- Exclusion tag: \`${exclusionTagName}\` (\`${exclusionTagId}\`)`);
  const countLine = dryRun
    ? `- Would deploy: **${wouldDeploy.length}** · Skipped: **${skipped.length}** · Failed: **${failed.length}**`
    : `- Deployed: **${deployed.length}** · Skipped: **${skipped.length}** · Failed: **${failed.length}**`;
  lines.push(countLine);
  if (dryRun && wouldDeploy.length) lines.push(`\n**Would deploy:** ${wouldDeploy.join(", ")}`);
  if (!dryRun && deployed.length) lines.push(`\n**Deployed:** ${deployed.join(", ")}`);
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
