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

## Argon dogfood release

The October 27 candidate adds native Gemini support to the OpenCode Go plugin,
including Gemini 4 Argon. The core, catalog gateway and other plugin binaries
are byte-identical to the October 24 native-images base. The image embeds the
new plugin commit, source-tree digest, binary hash and debug build tag.

The debug tag enables `debugTrace`, which appends request/control-flow metadata
to `/opt/cpa/opencode-go-debug.log` in the core container's writable layer. It
does not log complete request bodies or credentials. There is no automatic
rotation; the file survives restarts and is removed when the container is
recreated. Docker's stdout log limits do not cover this file. During dogfooding,
check its size and truncate it when it reaches 10 MiB:

```sh
sudo -n /usr/local/bin/docker exec easy-cli-proxy-core stat -c '%s bytes' /opt/cpa/opencode-go-debug.log
sudo -n /usr/local/bin/docker exec easy-cli-proxy-core sh -c ': > /opt/cpa/opencode-go-debug.log'
```

Run these on the NAS; truncate only after inspecting the size. Keep any trace
needed for diagnosis private, and remove this diagnostic build after dogfooding.

The feature branch is
[`feature/gemini-argon`](https://github.com/samaluk/opencode-go-cliproxyapi/tree/feature/gemini-argon),
based directly on upstream main for a later upstream PR. The deployed source
[`4ac475e`](https://github.com/samaluk/opencode-go-cliproxyapi/commit/4ac475e8ba1adad64ca1fd5051d6cf622637ecf4)
also retains the existing local contributions. Packaging and the source lock are
on [`deployment/20261027-argon-dogfood`](https://github.com/samaluk/CLIProxyAPI/tree/deployment/20261027-argon-dogfood/deployment).

Enroll Argon through the existing private Go catalog after the new plugin is
healthy. It uses the same Personal Go credential and account-binding policy.
The user did not request changing model defaults. Roll back the image pin while
retaining current OAuth, credentials and binding state.

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
