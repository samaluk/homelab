---
name: homelab-komodo
description: >-
  Operate the homelab Komodo instance via komodo_client (list/deploy/restart stacks,
  logs, containers, servers). Use when the user mentions Komodo, stack deploys, Komodo
  secrets/env, redeploying compose stacks, or managing containers through Komodo rather
  than raw SSH docker. Prefer this over SSH for deploy lifecycle; pair with homelab-synology
  for in-container debugging.
---

# Homelab Komodo

This repo manages Docker Compose stacks on Synology through [Komodo](https://komo.do). Use the bundled `komodo_client` and CLI instead of guessing SSH deploy steps when the task is about Komodo resources (stacks, deploys, pulls, Komodo env/secrets).

## Komodo version

Homelab Synology runs Komodo **v2** (`ghcr.io/moghtech/komodo-core:2`). The **Komodo stack itself is not in this repo** — source of truth on the NAS:

- Path: `/volume1/docker/komodo`
- Compose: `ferretdb.compose.yaml`, env: `compose.env`
- Deploy: `sudo -n /usr/local/bin/docker-compose -f ferretdb.compose.yaml --env-file compose.env` from that directory (see **homelab-synology** for SSH)
- The compose **must** end with a top-level `volumes:` block (`postgres-data`, `ferretdb-state`, `keys`) plus service mounts for `keys:/config/keys` on core/periphery — do not drop it when editing

Set `COMPOSE_KOMODO_IMAGE_TAG=2` in `compose.env`. Do not use `:latest` for core/periphery images. Upgrade notes: [v2.0.0](https://komo.do/docs/releases/v2.0.0).

**Always pass `--env-file compose.env`.** Without it, `COMPOSE_KOMODO_BACKUPS_PATH` is empty and core’s bind mount becomes `:/backups` → Docker uses `.` as the source → `volume name is too short`. DB vars also default to blank.

```bash
cd /volume1/docker/komodo
sudo -n /usr/local/bin/docker-compose -f ferretdb.compose.yaml --env-file compose.env up -d
```

### Komodo Actions are unsupported on this host

Do not use Komodo Actions on this Synology host. Same class of bug as [rustfs#1633](https://github.com/rustfs/rustfs/issues/1633): many Synology boxes run kernel **3.10.x**, which has no `getrandom(2)` (added in 3.17). **Deno** inside `komodo-core` is Rust-linked and action execution can abort with `getentropy failed`.

Observed action log pattern:

```text
deno run --allow-all /action-cache/….ts
getentropy failed.
```

Avoid `RunAction`, action scripts, Deno action cache workarounds, and terminal-exec actions. Use Komodo for stack orchestration only; use **homelab-synology** (`docker exec`, `docker logs`, Ofelia logs) for one-off commands inside containers.

## Setup (once per machine)

1. Dependencies are already in repo root `package.json` (`komodo_client`). Install with `bun install` from the repo root.
2. In Komodo UI: **Settings → API Keys** → create a key with permission to read/execute the stacks you need.
3. Set in repo root `.env` (gitignored): `KOMODO_URL` (no trailing slash), `KOMODO_API_KEY`, `KOMODO_API_SECRET`.

Verify:

```bash
cd /path/to/homelab
bun .agents/skills/homelab-komodo/scripts/komodo/cli.ts version
bun .agents/skills/homelab-komodo/scripts/komodo/cli.ts stacks
```

Never commit `.env` or print secrets in chat output.

## CLI (preferred for agents)

From repo root:

```bash
bun .agents/skills/homelab-komodo/scripts/komodo/cli.ts <command> [args]
```

| Command | Purpose |
|---------|---------|
| `stacks` | List stack names (tab-separated metadata) |
| `stack <name>` | Full stack JSON |
| `services <stack>` | Services in stack |
| `deploy <stack> [--poll]` | Deploy; `--poll` waits until Komodo marks the update complete |
| `pull <stack> [--poll]` | Pull images |
| `restart <stack> [--poll]` | Restart stack |
| `stop <stack> [--poll]` | Stop stack |
| `logs <stack> [tail]` | Stack log (default tail 200) |
| `containers [server]` | List containers (optional server name) |
| `servers` | List Komodo servers |
| `update <id>` | Inspect a deploy/update record |

**Destructive:** `stop`, and deploy paths that recreate containers. Confirm with the user before `stop` or `destroy`-class operations unless they explicitly asked.

## Workflow

1. **Map repo folder → Komodo stack name.** Folder names (e.g. `open-webui`, `trek`) often match stack names but are not guaranteed—run `stacks` first.
2. **Read before mutate:** `stack <name>` or stack-local `README.md` / `compose.yaml` in this repo.
3. **Deploy/restart:** use `deploy` or `restart` with `--poll` when you need to know completion before continuing (e.g. then hit health checks).
4. **Debugging running containers:** after deploy, use **homelab-synology** (`docker logs`, `docker exec`) on the Synology host. Komodo is for orchestration; SSH is for runtime inspection inside containers.
5. **Env/secrets in Komodo:** stack compose often references Komodo variables/secrets (see comments in compose files). Changing them is done in Komodo UI or write APIs—not only in git. Git changes still need a deploy to apply.

## Programmatic use (custom scripts)

Import order matters: polyfill `localStorage` before `komodo_client` (see `.agents/skills/homelab-komodo/scripts/komodo/client.ts`).

```ts
import { createKomodoClient } from "./.agents/skills/homelab-komodo/scripts/komodo/client.ts";

const komodo = createKomodoClient();
const stacks = await komodo.read("ListStacks", {});
const update = await komodo.execute_and_poll("DeployStack", { stack: "open-webui" });
```

- `read` — query state (stacks, logs, containers, updates).
- `execute` — starts an operation; returns an `Update` immediately.
- `execute_and_poll` — same, but waits until the update completes (use for deploy/restart/pull).
- `write` — config changes (stacks, variables); use sparingly and only when the user wants Komodo config edited.

For the full request catalog, see [reference.md](reference.md) and [Komodo client docs](https://docs.rs/komodo_client/latest/komodo_client/).

## Common homelab tasks

| User intent | Komodo approach |
|-------------|-----------------|
| Redeploy after git push | `deploy <stack> --poll` (Komodo may also auto-deploy from repo sync—check stack config) |
| Restart without rebuild | `restart <stack> --poll` |
| New image tag in compose | merge git → `deploy <stack> --poll` or `pull` then `deploy` |
| Why deploy failed | `logs <stack>`; if needed `update <id>` from failed command JSON |
| Check what's running | `containers` or homelab-synology `docker ps` |
| Set `APP_URL` / secrets | Komodo UI variables for that stack, then redeploy |

## Errors

- **401 / permission errors:** API key scope or wrong secret; regenerate key in Komodo.
- **Unknown stack:** run `stacks`; name may differ from repo directory.
- **Import `localStorage` error:** use `scripts/komodo/client.ts` or call `ensureLocalStorage()` from `scripts/komodo/polyfill.ts` before importing `komodo_client`.
- **`getentropy failed`:** this is why Komodo Actions are unsupported on this host. Use stack orchestration through Komodo and runtime/container debugging through **homelab-synology**.

## Related

- [homelab-synology](../homelab-synology/SKILL.md) — SSH + Docker on Synology
- [reference.md](reference.md) — read/execute API cheat sheet
