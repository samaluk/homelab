# Scoped CLIProxyAPI

Two stock CLIProxyAPI instances on the Synology NAS. Each instance loads only
its own upstream credentials and accepts only its own downstream API key.
Retries and model selection stay within the instance. Neither instance uses
the session-based account-binding plugin, so custom clients such as fx can
send ordinary OpenAI-compatible requests without a session header.

| Scope | Host listener | Private data directory |
| --- | --- | --- |
| Personal | `127.0.0.1:8321` | `/volume1/docker/cli-proxy-scoped/personal` |
| Work | `127.0.0.1:8322` | `/volume1/docker/cli-proxy-scoped/work` |

## Provisioning and migration

Register `cli-proxy-scoped` in Komodo on `Local`, watching this directory's
`compose.yaml`. Provision both private directories before the first deploy.
Each must contain its own `config.yaml` and `auth/`. Use mode `0700` for the
directories and `0600` for credential-bearing files. Keep configuration and
credentials on the NAS; no API key, OAuth state, or management secret belongs
in Compose or Git. `CPA_SCOPED_DATA_DIR` can point to an isolated fixture for
local validation. On Synology, newly created paths under the Docker share can
inherit ACLs even when created with a restrictive umask. Inspect the new stack
paths with `synoacltool -get`; remove inherited ACLs from those paths only,
then verify owner-only modes before writing real credentials. Do not change
the parent share ACL.

The NAS has exhausted Docker's default network pools. The Personal and Work
bridges use `172.16.13.0/28` and `172.16.13.16/28`, respectively. These ranges
were checked against the NAS's existing Docker networks and routes. On another
host, check for conflicts and override them with `CPA_SCOPED_PERSONAL_SUBNET`
and `CPA_SCOPED_WORK_SUBNET` if needed.

Use the pinned release's [configuration example][config]. Set `server.host`
to `0.0.0.0` inside the container, `server.port` to `8317`, `oauth.auth-dir` to
`/data/auth`, and configure a different `access.api-keys` entry in each
instance. Keep discovery disabled. Enable management only for scopes that T3 monitors,
as described below. Add only that scope's provider definitions and OAuth credentials. Preserve fully qualified
model IDs where supported so existing CLI presets do not need renaming.

Validate a candidate with synthetic providers or API credentials before moving
OAuth accounts. Stop the original owner before transferring any existing OAuth
identity, including its refresh journals, to a new owner. Keep the newest
OAuth state on rollback. A restore of old refresh tokens is not a rollback.

The Personal listener uses tailnet HTTPS port `8446`; Work uses `8445`. Leave
Funnel and WAN ingress off. On NAS Docker versions older than 28, also verify
that LAN clients cannot reach the raw loopback-published ports. Check that
only the matching scope’s key and scoped models work on each listener.

The retired `easy-cli-proxy` stack used tailnet HTTPS port `443` and loopback
port `8317`. Remove the containers and the Komodo registration before merging
the deletion of its Compose file so scheduled reconciliation cannot redeploy
it. The old Serve entry can be removed on the NAS with
`sudo tailscale serve --https=443 off`. Keep the private state at
`/volume1/docker/easy-cli-proxy/data` for recovery. Git history retains the original Compose definition. Restoring
the old OAuth files would not restore current grants; verify ownership and
refresh state before any recovery.

## T3 Code usage limits

T3 reads each stock instance as a separate CLIProxyAPI Usage source. Use the
listener URLs without `/v1`. Set an independent `management.secret-key` for
each scope. Keep `management.allow-remote: true` while T3 polls the instance
from another host, set `management.disable-control-panel: true`, and restrict
access to the tailnet. The management key is
an administrator credential; keep it in T3’s server-side secret store and
out of client profiles. Confirm that the opposite scope’s management key
is rejected by each endpoint.

T3 reads supported OAuth account quotas, such as Codex and Claude. This
integration does not read API-key budgets for Work LiteLLM or Personal
OpenCode Go.

[config]: https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.77/config.example.yaml

## OAuth routes and Personal OpenCode Go

Use CLIProxyAPI's native OAuth logins for Work Codex and Personal Claude. Use
fresh grants for this stack while the legacy gateway still owns its grants.
Verify the account and workspace before installing a grant. Preserve
`work/codex-oauth/<model>` and `personal/claude-oauth/<model>` with a scope
`prefix` and per-credential `model_aliases` in the corresponding auth store.
The Personal Codex grant stays in the Personal store.

OpenCode Go runs as an external plugin on Personal only. The stock CPA image
and the Work configuration stay independent of the plugin. The [pinned fork
commit][go-pin] builds on upstream v0.2.2, retains the legacy protocol fixes,
and adds the catalog parsing from [upstream #19][go-19] and support for the
`personal/opencode-go` prefix. [Upstream #20][go-20] and [#21][go-21] track
reasoning replay and Claude effort support. Revisit the pin when upstream
supports the required features and the scoped ID can be preserved.

Build from a clean source archive on a Docker host. This uses the Synology's
`linux/amd64` target and the pinned Go builder used to validate the plugin:

```bash
src=$(mktemp -d)
out=$(mktemp -d)
git -C "$src" init -q
git -C "$src" fetch --depth=1 https://github.com/samaluk/opencode-go-cliproxyapi.git \
  2d809cda9cb3336ba904f6076a3b8e873cd0dd5c
mkdir "$src/tree"
git -C "$src" archive FETCH_HEAD | tar -x -C "$src/tree"
docker run --rm --platform linux/amd64 \
  -e GOAMD64=v1 -e CGO_ENABLED=1 -e GOTOOLCHAIN=local \
  -v "$src/tree:/src:ro" -v "$out:/out" -w /src \
  golang:1.26.7-bookworm@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514 \
  sh -ec 'go test -mod=readonly ./... && go vet -mod=readonly ./... &&
    go build -trimpath -buildvcs=false -mod=readonly -buildmode=c-shared \
      -ldflags="-X opencode-go-cliproxyapi/internal/plugin.pluginVersion=0.2.2-homelab.2d809cd" \
      -o /out/opencode-go-cliproxyapi.so .'
shasum -a 256 "$out/opencode-go-cliproxyapi.so"
```

Copy the checked library as `personal/plugins/opencode-go-cliproxyapi.so`
under the private stack data directory. The rollout artifact SHA-256 is
`c5e67722fb6393279b5cc39778ac4f745455c5d04e9fc4abea14f0d2c5bca61e`.
Verify the transferred bytes and owner-only permissions before enabling the
plugin. Keep one loadable copy in the plugin directory.

Back up Personal's current `config.yaml` with mode `0600`. Atomically replace
its `plugins` section with the following, supplying the existing Personal
OpenCode Go key in the private file. Leave Work's plugin setting disabled.

```yaml
plugins:
  enabled: true
  dir: /data/plugins
  configs:
    opencode-go-cliproxyapi:
      enabled: true
      model-prefix:
        enabled: true
        value: personal/opencode-go
      api-keys:
        - name: Personal
          value: <personal-opencode-go-key>
```

Restart only the `personal` service through Komodo if the running gateway
does not load the new plugin after the config change.

Check the ordinary OpenAI `/v1/models` response without Anthropic headers,
which select the Claude client view. Confirm the native OAuth aliases are
still listed, only Personal lists `personal/opencode-go/` models, and a
Personal OpenCode Go request completes against the real upstream. The plugin
uses the live upstream catalog; the legacy file snapshot can list routes
that the current catalog does not advertise. Compare client defaults and tool
behavior before switching any client that still needs the legacy catalog.
To roll back plugin activation, atomically restore the prior Personal config;
restart only Personal if needed. Keep the current OAuth grants and their
refresh state.

[go-pin]: https://github.com/samaluk/opencode-go-cliproxyapi/tree/2d809cda9cb3336ba904f6076a3b8e873cd0dd5c
[go-19]: https://github.com/massiveits/opencode-go-cliproxyapi/pull/19
[go-20]: https://github.com/massiveits/opencode-go-cliproxyapi/pull/20
[go-21]: https://github.com/massiveits/opencode-go-cliproxyapi/pull/21
