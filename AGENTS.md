# AGENTS.md

This repository is the source of truth for Docker Compose stacks running in a
personal homelab. Existing stacks run on a Synology NAS; `debian-dev` is also
registered in Komodo. Komodo deploys the stacks; Infisical and Komodo provide
runtime configuration and secrets.

## Repository model

- Each top-level service directory is one Komodo stack and normally contains a
  single `compose.yaml`.
- `hosts/` contains host bootstrap configuration and runbooks, not stacks.
  Read the target host's README before changing its runtime. Select the intended
  Komodo server when creating a stack; do not assume every stack runs on the NAS.
- A stack may also contain a `README.md` with service-specific operational
  details. Read it before changing or debugging that stack.
- Host bind mounts generally live below `/volume1` on the Synology NAS. Preserve
  existing paths, ownership (`PUID`, `PGID`, or `user`), and port mappings unless
  the task explicitly requires changing them.
- Compose variables such as `${DB_PASSWORD}` are supplied by Infisical or
  Komodo. Secret folders in Infisical match stack directory names.
- `.agents/skills/homelab-komodo/` contains the Komodo API tooling used for stack
  lifecycle operations. `.agents/skills/homelab-synology/` documents direct
  Synology inspection and in-container debugging.
- Pin Compose images by release tag and SHA-256 digest. If upstream has no
  release tags, use a commit tag and digest, or a digest-only reference. Do not
  use `latest`, `main`, or `master` tags.
- Prefer upstream-maintained Docker Hub images when the same release is
  available there. GHCR is acceptable when upstream only publishes there.
- `renovate.json` manages image updates. Digest, patch, and minor updates normally
  automerge; major updates require review. Startup migrations alone do not
  justify disabling automerge. Document service-specific exceptions in that file.

## Deployment flow

Changes must reach `main` through a pull request. A push to `main` starts
`.github/workflows/komodo-redeploy-modified-stacks.yml`, which compares the push,
maps changed files to Komodo's watched stack files, and queues
`DeployStackIfChanged` only for affected stacks. Scheduled and manually
dispatched runs reconcile every non-excluded stack.

Changing a stack's watched `compose.yaml` therefore deploys that stack after the
PR is merged. Documentation-only or unrelated root changes do not select a
stack. Do not manually redeploy a stack as a substitute for merging the source
change unless the user explicitly requests an operational intervention.

## Making changes

1. Start from the latest remote `main` and use a feature branch or worktree.
2. Inspect the target stack's `README.md`, `compose.yaml`, and related Renovate
   rules before editing.
3. Keep the change scoped to the requested stack or repository automation.
4. Preserve the existing Compose style and key ordering enforced by `.dclintrc`.
5. Use environment placeholders for credentials and deployment-specific values.
   Never commit `.env` files, API keys, passwords, tokens, or values copied from
   a running container.
6. Open a PR and merge it before expecting Komodo to apply the change.

When adding a stack, create `<stack-name>/compose.yaml`, use the same name for
its Komodo stack and Infisical folder, document unusual setup or recovery steps,
and add it to the root `README.md` stack table.

## Validation

Run the repository's Compose lint before pushing:

```bash
bun install --frozen-lockfile
bunx dclint . -r -c .dclintrc
```

For a changed stack, also render its Compose configuration when the required
non-secret variables are available:

```bash
docker compose -f <stack>/compose.yaml config --quiet
```

Do not invent secret values merely to make `docker compose config` pass. If the
environment is unavailable, run dclint and state that rendered Compose
validation was not performed.

## Runtime operations

- Use the `homelab-komodo` skill for Komodo deploys, restarts, stack logs, and
  Komodo-managed environment configuration.
- Use the `homelab-synology` skill for Docker/container inspection, host logs,
  and commands inside running containers. Load the target stack's README first.
- Prefer read-only inspection while diagnosing. Do not restart, recreate,
  redeploy, prune, or mutate persistent data unless the user asked for it.
- Treat live environment output as sensitive. Report variable names and
  redacted findings, not secret values.
- After a merged deployment change, verify the GitHub workflow, Komodo stack
  status, and relevant container health or logs when the task calls for
  end-to-end confirmation.

## High-risk changes

Database image upgrades, database passwords, volume paths, user/group IDs,
network modes, and published ports can cause outages or data loss. Preserve
existing volumes and review upstream migration notes before changing database
major versions. Never delete or recreate volumes as an implicit troubleshooting
step.
