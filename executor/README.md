# Executor

Executor v2 provides shared apps, service accounts, and an MCP endpoint. This
stack runs on Komodo server **`debian-dev`**, with the published self-host image
pinned to **2.0.0-beta.41** and its multi-architecture digest. It uses one CPU
and at most 1 GiB RAM, with PGlite and persistent state on Debian's local disk.

## Access and sign-in

- Web UI: `https://debian-dev.tailcb5930.ts.net:8444`.
- MCP endpoint: `https://debian-dev.tailcb5930.ts.net:8444/mcp`.
- Docker publishes container port 4400 as host port 4788 on loopback only.
  Tailscale Serve terminates HTTPS and forwards to `http://127.0.0.1:4788`;
  Funnel is not enabled.
- Clients need Tailscale access to Debian. Cloud agents without tailnet
  connectivity cannot reach this deployment.

The dashboard and apps' MCP/API surfaces are available at this address, but
embedded app web pages are **not available**. `EXECUTOR_APP_UI_BASE_URL` is
intentionally unset: a non-localhost deployment needs a separate app origin with
wildcard DNS and TLS. Tailscale MagicDNS/Serve does not provide that wildcard
domain, and using the dashboard origin as the app base would produce
unresolvable subdomains. Apps that include a web page report `no_app_domain`;
their tools remain usable. Adding an app domain is separate infrastructure work.

V2 does not read v1's `EXECUTOR_BOOTSTRAP_ADMIN_*` variables. A fresh v2 database
requires first-administrator and organization setup. Complete that setup before
handing the instance to clients; later users need an invitation. Keep the legacy
bootstrap credentials in Infisical for v1 rollback, not as v2 runtime settings.
Use the UI's Connect instructions to authorize MCP clients through browser
sign-in. Do not put an administrator password in agent configuration.

Private-network access from app code remains disabled through
`EXECUTOR_APPS_ALLOW_PRIVATE_FETCH=false`. Host-side MCP import and OAuth requests
use upstream's default public-network restrictions; no private-origin allowlist
is configured. V1's local-network and stdio flags do not apply to v2 and are not
passed through. Review any network capability change through a PR.

The beta image includes upstream PostHog usage-analytics configuration. Compose
sets `EXECUTOR_DISABLE_ANALYTICS=1` to prevent that new outbound analytics traffic.
The local Motel trace store is separate and remains enabled.

## Secrets and deployment

Infisical **prod /executor** must contain:

- `EXECUTOR_WEB_BASE_URL`: the exact HTTPS origin above, including port 8444.
- `BETTER_AUTH_SECRET`: a stable session secret of at least 32 characters.

Compose maps `EXECUTOR_WEB_BASE_URL` to v2's `BETTER_AUTH_URL`. On first boot v2
generates `/app/data/encryption.key` and reuses it on later boots. Back it up with
the database. V1's `EXECUTOR_SECRET_KEY` is not a v2 encryption-key setting;
retain it and the legacy bootstrap variables in Infisical for rollback.

The Komodo stack uses the shared `homelab` linked repo, branch `main`, run
directory `executor`, and `compose.yaml`. Register `populate-env.sh` as an
additional watched file requiring redeployment of the `executor` service.
Disable independent Komodo image auto-updates. Renovate requires manual review
while Executor is on a v2 beta because prereleases can change storage and
authentication contracts. Stable digest, patch, and minor updates follow the
repository defaults; major updates require review. Merge source changes
through a PR; the repository workflow then queues `DeployStackIfChanged`.

Upstream publishes release images only to GHCR. Renovate has no release
timestamp for this registry, so the one-day release-age delay does not apply.
Keep both the release tag and digest pinned.

The pre-deploy command uses Komodo's existing Infisical identity references:

```bash
INFISICAL_CLIENT_ID="[[INFISICAL_CLIENT_ID]]" \
INFISICAL_CLIENT_SECRET="[[INFISICAL_SECRET]]" \
INFISICAL_PROJECT_ID="[[INFISICAL_PROJECT_ID]]" \
INFISICAL_DOMAIN="https://infisical.malukzedan.synology.me" \
bash ./populate-env.sh
```

`populate-env.sh` authenticates without a persistent CLI login, exports only
`/executor`, checks the two required variable names, and atomically installs a mode-0600
`.env` in the deployment directory. A failed export leaves the previous file
intact. The identity must be able to read the folder. Do not print the token,
exported values, or container environment while diagnosing deployment.

## Host setup

Read [`hosts/debian-dev/README.md`](../hosts/debian-dev/README.md) before host
maintenance. Provision both v2 bind mounts as UID/GID **1000:1000**, mode 0700:

- `/srv/executor-v2` → `/app/data`: PGlite, app source/builds/data, and encryption key.
- `/srv/executor-v2-motel` → `/app/motel-data`: telemetry, separate from product data.

The image's unprivileged user is `1000:1000`; Compose sets it explicitly so the
entrypoint does not need to start as root. Preserve existing ownership and
contents on subsequent deployments. The legacy `/srv/executor` directory belongs
to **65532:65532** and must remain untouched for rollback.

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

The native `executor-host health` check requests `/health`; Compose allows
120 seconds for startup. Verify Komodo reports
the stack running and the container healthy, then check the HTTPS UI and MCP
authentication. An unauthenticated MCP request should receive an authentication
challenge. Use Komodo for lifecycle operations and stack logs.

Before a v2 update, stop the stack through Komodo and back up all of
`/srv/executor-v2`, including `encryption.key`, together with the matching
Infisical session secret. Back up telemetry separately if it is needed. Do not
copy a running PGlite database as an ordinary filesystem backup. Store backups
outside this repository. Losing the encryption key makes saved accounts
unreadable. Startup data steps can make a previous image incompatible; restore
the matching product data and keys when rolling back. Never delete or recreate
a data directory as a troubleshooting shortcut.

## V1 to v2 cutover and rollback

Upstream explicitly requires a new v2 volume: this is **not** an in-place v1
SQLite migration. The v1 instance was checked before cutover and had one user,
one organization, and no integrations, connections, registered OAuth applications,
or tools. V2 starts with fresh product state and needs client authorization again.

Before deploying v2, create a SQLite-consistent backup of v1's `data.db` with the
SQLite backup API. Retain that snapshot, the v1 Compose file, and its mode-0600
environment file in a root-only timestamped directory under
`/srv/backups/executor`. Keep the original `/srv/executor` directory and legacy
Infisical secrets unchanged. Provision the separate v2 directories above, merge
the source change, then let the GitHub workflow deploy through Komodo. The
Tailscale Serve configuration and client endpoint do not change.

To return to v1, revert this migration through a PR so Compose, the environment
hook, and documentation return together. The v1 image resumes using its original
`/srv/executor` bind mount and Infisical keys. Retain the v2 directories for
recovery; never mount them into v1 or overwrite v1 with v2 data. If the original
v1 database is damaged, stop the stack through Komodo before restoring its
consistent snapshot and matching secrets with ownership `65532:65532`.

Upstream reference: [self-host v2 beta instructions](https://github.com/UsefulSoftwareCo/executor/blob/executor%402.0.0-beta.41/apps/hosted/self-host/README.md).
