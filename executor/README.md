# Executor

Executor provides a shared MCP, OpenAPI, and GraphQL integration catalog. This
stack runs on Komodo server **`debian-dev`**, with the published self-host image
pinned by version and digest. It uses one CPU and at most 1 GiB RAM, with SQLite
and persistent state on Debian's local disk.

## Access and sign-in

- Web UI: `https://debian-dev.tailcb5930.ts.net:8444`.
- MCP endpoint: `https://debian-dev.tailcb5930.ts.net:8444/mcp`.
- Docker publishes port 4788 on loopback only. Tailscale Serve terminates HTTPS
  and forwards to `http://127.0.0.1:4788`; Funnel is not enabled.
- Clients need Tailscale access to Debian. Cloud agents without tailnet
  connectivity cannot reach this deployment.

The owner account is created before the first browser visit. Its email and
initial password are stored as `EXECUTOR_BOOTSTRAP_ADMIN_EMAIL` and
`EXECUTOR_BOOTSTRAP_ADMIN_PASSWORD` in Infisical **prod /executor**. Sign in,
then add integrations and use the UI's Connect instructions for MCP clients.
Do not put the owner password in agent configuration; use Executor's OAuth or
client credentials flow. Bootstrap variables only seed a fresh database;
subsequent password changes must use the application's account controls.

Private-network access from sandboxed code and local stdio MCP process spawning
are disabled. Prefer remote MCP/API integrations. Changing either setting is
an explicit capability change to review through a PR.

## Secrets and deployment

Infisical **prod /executor** must contain:

- `EXECUTOR_WEB_BASE_URL`: the exact HTTPS origin above, including port 8444.
- `EXECUTOR_BOOTSTRAP_ADMIN_EMAIL` and `EXECUTOR_BOOTSTRAP_ADMIN_PASSWORD`.
- Optional `EXECUTOR_BOOTSTRAP_ADMIN_NAME` (defaults to `Admin`).
- `BETTER_AUTH_SECRET`: a stable session secret of at least 32 characters.
- `EXECUTOR_SECRET_KEY`: the stable key encrypting stored integration secrets.

The Komodo stack uses the shared `homelab` linked repo, branch `main`, run
directory `executor`, and `compose.yaml`. Register `populate-env.sh` as an
additional watched file requiring redeployment of the `executor` service.
Disable independent Komodo image auto-updates; Renovate proposes image updates
for review because startup can migrate SQLite. Merge source changes through
a PR; the repository workflow then queues `DeployStackIfChanged`.

The pre-deploy command uses Komodo's existing Infisical identity references:

```bash
INFISICAL_CLIENT_ID="[[INFISICAL_CLIENT_ID]]" \
INFISICAL_CLIENT_SECRET="[[INFISICAL_SECRET]]" \
INFISICAL_PROJECT_ID="[[INFISICAL_PROJECT_ID]]" \
INFISICAL_DOMAIN="https://infisical.malukzedan.synology.me" \
bash ./populate-env.sh
```

`populate-env.sh` authenticates without a persistent CLI login, exports only
`/executor`, checks required variable names, and atomically installs a mode-0600
`.env` in the deployment directory. A failed export leaves the previous file
intact. The identity must be able to read the folder. Do not print the token,
exported values, or container environment while diagnosing deployment.

## Host setup

Read [`hosts/debian-dev/README.md`](../hosts/debian-dev/README.md) before host
maintenance. Provision `/srv/executor` on Debian as UID/GID **65532:65532**,
mode 0700; the upstream image runs as that user and writes `/data` there.
Preserve existing ownership and contents on subsequent deployments.

Debian needs the native Infisical CLI for the pre-deploy hook. Onboarding used
**v0.44.2**, installed at `/usr/local/bin/infisical`, from
[`cli_0.44.2_linux_amd64.tar.gz`](https://github.com/Infisical/cli/releases/tag/v0.44.2)
with verified archive SHA-256:

```text
6e8a3b9c4f17e2a95d5934f9bc87b7935927c4cd43dd5f9ba984a89f898022ca
```

Tailscale Serve configuration is host state, separate from Compose. On Debian,
restore only Executor's endpoint with:

```bash
sudo tailscale serve --bg --https=8444 http://127.0.0.1:4788
```

Existing HTTPS handlers on ports 443 and 8443 belong to other services; preserve
them. Executor does not join the NAS's Docker networks or need a Traefik route.

## Health, backups, and upgrades

The image's built-in healthcheck requests `/api/health`. Verify Komodo reports
the stack running and the container healthy, then check the HTTPS UI and MCP
authentication. An unauthenticated MCP request should receive an authentication
challenge. Use Komodo for lifecycle operations and stack logs.

Back up `/srv/executor` consistently and retain the matching Infisical encryption
and session secrets. Stop the stack through Komodo during a filesystem copy,
or use a SQLite-aware backup; do not rely on copying a live database alone.
Store backups outside this repository. Losing or changing `EXECUTOR_SECRET_KEY`
can make stored integration credentials unreadable.

Before upgrades, review the release notes and take that paired backup. A
rollback may require restoring both the old database and its keys; changing
the image pin alone does not undo migrations. Never delete or recreate the
data directory as a troubleshooting shortcut.
