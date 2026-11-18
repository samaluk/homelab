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
local validation.

Use the pinned release's [configuration example][config]. Set `server.host`
to `0.0.0.0` inside the container, `server.port` to `8317`, `oauth.auth-dir` to
`/data/auth`, and configure a different `access.api-keys` entry in each
instance. Keep remote management and discovery disabled. Add only that
scope's provider definitions and OAuth credentials. Preserve fully qualified
model IDs where supported so existing CLI presets do not need renaming.

Validate a candidate with synthetic providers or API credentials before moving
OAuth accounts. Stop the original owner before transferring any existing OAuth
identity, including its refresh journals, to a new owner. Keep the newest
OAuth state on rollback. A restore of old refresh tokens is not a rollback.

Keep the existing `easy-cli-proxy` listener and its tailnet route in place
during staging. Use SSH forwarding for a local pilot. For normal client use,
publish the two listeners through separate tailnet-only HTTPS routes; confirm
that each route reaches the intended backend and leave Funnel and WAN ingress
off. On NAS Docker versions older than 28, also verify that LAN clients cannot
reach the raw loopback-published ports.

Before changing a client profile, confirm its own key and model work, the
opposite key and model fail, and a real fx turn streams without a session
header. Preserve existing model discovery, tool continuations, and any routes
that need additional plugins, such as Personal OpenCode Go. The stock image is
not a replacement for the existing catalog service by itself. Change one
profile at a time; restore the prior endpoint if acceptance fails.

[config]: https://github.com/router-for-me/CLIProxyAPI/blob/v8.0.77/config.example.yaml
