# Shared subscription gateway

This stack moves subscription routing off the Mac so clients can use the same
accounts and model definitions from any connected machine. It runs reviewed
CLIProxyAPI and native plugins, plus a small catalog service, in two containers
built from the same pinned image. Models still run at their providers.

The source and build lock live in
[samaluk/CLIProxyAPI](https://github.com/samaluk/CLIProxyAPI/tree/deployment/tailnet-catalog-sync/deployment).
Read its `REMOTE-GATEWAY.md` for client installation and sync behavior.

## Address and access

The NAS's Tailscale Serve configuration sends HTTPS traffic to
`127.0.0.1:8317`. Only the catalog container publishes a host port, on loopback.
The core is accessible only on the Compose network. Do not add WAN forwarding
or Tailscale Funnel.

Clients use `https://malukzedansyngy.tailcb5930.ts.net`, plus `/v1` where their
OpenAI-compatible configuration requires it. Personal and work profiles retain
separate downstream keys. The binding plugin enforces existing scope/source and
session policies. The remote management UI requires its separate management
secret. Keep that secret out of client profiles.

## Private state

Provision `/volume1/docker/easy-cli-proxy/data` with mode 0700 before deployment.
Its contents are not tracked in Git or stored in Compose environment variables:

- `config.yaml`: existing provider credentials, model aliases and plugin settings;
- `auth/`: provider OAuth state, owned and refreshed by this gateway;
- `state/account-scope-state.json`: existing session/account bindings;
- `catalogs/opencode-go.json`: provider capability definitions;
- `trusted-templates.json`: administrator-maintained native model prompt templates;
- `gateway.json`: catalog listener/backend, scoped downstream keys, discovery client version.

The catalog service reads state through a read-only mount. The core can update
OAuth and account-binding state. Back up this directory privately. A code
rollback must retain the newest credential and binding state.

## Deployment and updates

Create the `easy-cli-proxy` Komodo stack using the shared homelab repository,
branch `main`, run directory `easy-cli-proxy`, file `compose.yaml`. Disable
independent automatic image updates. This repository's workflow deploys the
stack after a change to the watched Compose file reaches main through a PR.

Build on another amd64-capable Docker host with `GOAMD64=v1`; the DS916 has no
AVX and should not build Go projects. Both services must use the same reviewed
image digest. Generic Renovate updates are disabled for this assembled image.
Release changes through the source lock, tests, image publication, then one
homelab PR updating both pins. Desktop Easy's update button manages its local
binaries; it does not install a NAS container release.

Client model catalogs update every five minutes from authenticated
`/catalog/v1`. A failed refresh retains saved definitions and reports an error.
Changes apply to new client processes; reload a T3 provider or start a new
session if its running process cached the earlier catalog. Upstream software
updates still require a reviewed image or client installer release. Never
execute downloaded code as part of a model catalog refresh.

## Migration and recovery

Stage API-only configuration first. Verify all three native plugins load on the
NAS's kernel and test TLS, catalogs and scope denial. Stop the Mac gateway
before copying the final OAuth/session state and starting its NAS replacement.
Never run both refresh owners concurrently. Switch scoped clients in small
steps; leave a coordinating Codex process on its working native provider.

If the NAS fails, keep clients' last working catalogs. To return to the Mac,
stop the NAS core, copy its newest auth and binding state back privately, then
restart the Mac core and change the client origin. Do not overwrite live state
with the pre-migration backup. A rollback changes the address, not model IDs.

## Checks

Use the homelab Komodo skill for lifecycle operations and Synology skill for
container inspection. Check health and plugin registration, both authenticated
catalogs, rejected cross-scope requests, a streaming inference and tool
continuation. Monitor `sync-state/status.json` on each client for refresh age and
missing native templates. Measure NAS memory/swap under actual concurrency;
current limits are 512 MiB for the core and 128 MiB for catalog/proxy traffic.
