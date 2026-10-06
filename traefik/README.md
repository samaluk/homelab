# Traefik ingress

Traefik replaces DSM's HTTPS reverse proxy while retaining Synology DDNS and
the existing `*.malukzedan.synology.me` application URLs. Komodo deploys the
`traefik` stack from this repository's `main` branch. The infrastructure can
run beside DSM while application routes and router cutover are prepared.

## Migration architecture

Traefik publishes HTTP on NAS port **8880** and HTTPS on **8443** so it can run
beside DSM. The UDM eventually forwards public TCP **80 → NAS:8880** and
**443 → NAS:8443**. Check LAN hairpin access and any local DNS overrides before
switching HTTPS. Keep DSM's existing rules and application port bindings for
rollback; changing router forwarding is a separate operational step.

Application containers opt in with `traefik.enable=true`, a hostname label
and an internal backend port. They join the external `homelab-proxy`
network while retaining their existing default/private networks. Databases and
worker containers stay on their original networks. Traefik creates the shared
network before application migration; do not run Compose down on its stack
while applications use that network.

Traefik defines the Docker network, hostname suffix, HTTPS entrypoint,
certificate resolver and standard 60-second backend timeouts once. A normal
application needs four labels, for example:

```yaml
labels:
  traefik.enable: 'true'
  homelab.hostname: 'budget'
  traefik.http.routers.budget.middlewares: 'hsts@file'
  traefik.http.services.budget.loadbalancer.server.port: '5007'
```

The Docker provider builds the hostname from `homelab.hostname` and
`TRAEFIK_DOMAIN`; its single service is assigned to the router automatically.
Give every opted-in container a hostname label and keep router/service names
unique across stacks. Additional labels express exceptions: Seerr's second
hostname, Actual iCal's longer timeout, Lidarr's media timeout, and Open WebUI's
streaming middleware. HSTS stays explicit to preserve Pi-hole's existing
file-provider route without HSTS. See Traefik's
[Docker default rule](https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/#defaultrule),
[automatic service assignment](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/#service-definition)
and [entrypoint defaults](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/).

The Docker provider talks to a restricted socket proxy on a separate internal
network. Only the socket proxy mounts the Docker socket. Discovery permits
only GET/HEAD requests for ping, version, container listing/inspection and
events. A mounted HAProxy allowlist blocks archive, export, logs, process
listing and write endpoints, including the overly broad `CONTAINERS=1`
behavior in the pinned upstream image. Container inspection still reveals
environment metadata; only Traefik joins this API network. The dashboard is
disabled.

The container healthcheck uses the image's lightweight `wget` to probe
Traefik's loopback ping endpoint. Launching the Traefik CLI for each probe can
exceed the healthcheck timeout under NAS disk pressure even while the running
proxy responds normally. The ping port is not published to the host, and the
dashboard remains disabled.

Host-network applications, DSM, Komodo, Portainer, and services on other LAN
machines use explicitly configured file-provider backends. Preserve their
existing access policy and HTTPS backend verification. Do not change a
host-network application's network mode just to integrate the proxy.

## Certificates and configuration

The infrastructure stack requires these non-secret runtime variables in its
Infisical folder:

- `TRAEFIK_ACME_EMAIL`: certificate account email.
- `TRAEFIK_PROXY_SUBNET`: unused CIDR for `homelab-proxy`.
- `TRAEFIK_PROXY_DYNAMIC_RANGE`: smaller CIDR within that subnet for automatic
  application addresses. Keep Traefik's reserved address outside this range.
- `TRAEFIK_PROXY_IP`: reserved address within that CIDR for Traefik, excluding
  its network, broadcast, Docker gateway and dynamic allocation range; applications
  can trust this exact proxy address instead of the whole shared network.
- `TRAEFIK_DOCKER_API_SUBNET`: different unused CIDR for the internal API network.
- `TRAEFIK_NAS_HOST`: NAS LAN address, used by explicit host backends.
- `TRAEFIK_DOMAIN`: optional hostname suffix; defaults to the existing DDNS name.
- `TRAEFIK_OPENCODE_HOST`, `TRAEFIK_T3CODE_HOST`: optional LAN hosts for the
  currently unavailable external backends. Unset values use container loopback,
  where their ports have no listener, preserving an unavailable route without
  blocking startup of ingress for active applications. Set the original LAN
  hosts in Infisical to reconnect them.
- `TRAEFIK_CERT_RESOLVER`: optional; defaults to `letsencrypt`. Set `staging`
  in the Traefik stack for a certificate test. All Docker routes inherit this
  entrypoint default, and file-provider routes use the same stack setting.
  Normal application stacks need no Traefik domain or certificate variables;
  Seerr's explicit alias rule accepts the optional `TRAEFIK_DOMAIN` override
  in its own stack as well.

Check the NAS routes and Docker networks before choosing subnets. This NAS has
nearly exhausted Docker's default address pools, so explicit unused CIDRs avoid
allocation failure. Additional file dependencies must name files, not the
mounted directory: register `dynamic/common.yaml`, `socket-proxy/haproxy.cfg`
and subsequent route files.

The deployed proxy subnet is `172.16.10.0/24`, with Traefik at `172.16.10.2`
and automatic allocations restricted to `172.16.10.128/25`. Docker selects
`172.16.10.128` as this network's gateway; application addresses start after it.
Without that
restriction, Docker can give Traefik's address to an application while the
proxy is being recreated, causing an `Address already in use` startup failure.
Docker's [IPAM configuration](https://docs.docker.com/reference/compose-file/networks/#ipam)
supports this separation without changing application labels or trusted proxies.

An existing network must be recreated to apply the allocation range. Perform
this before public cutover, or restore DSM forwarding first. Record its IPAM,
labels, attached container IDs and network aliases. Confirm each application
also retains its private network, then disconnect only `homelab-proxy` from
those containers. Remove the empty proxy network and deploy only Traefik through
Komodo to recreate the network from the merged Compose configuration. Check the
resulting gateway rather than assuming the previous network's gateway: adding
an allocation range can change Docker's automatic choice. If Compose reuses a
previously created Traefik container without its proxy endpoint, reconnect it
with the configured reserved address and verify its published ports.

Reconnect the existing application containers with their recorded aliases.
After every application is attached, restart only the Traefik stack through
Komodo to refresh Docker discovery. Network connection changes can leave cached
backend addresses pointing at application private networks, and containers that
were unhealthy during discovery can have missing routes. Verify Traefik's fixed
address, application addresses inside the dynamic range, original private
network IDs, container health and every active HTTP/WebSocket route. Application
containers, private networks, published ports and persistent data do not need
recreation for this repair.

Store runtime configuration in Infisical **prod /traefik**, matching the stack
name. Keep certificate accounts and private keys under
`/volume1/docker/traefik`; never commit them or expose them in logs.
Traefik runs as container root (UID/GID 0:0). Pre-create
`/volume1/docker/traefik/acme/` with mode 0700. Below that mounted directory,
create `/volume1/docker/traefik/acme/letsencrypt/` and
`/volume1/docker/traefik/acme/staging/` with mode 0700, each containing
`production.json` and `staging.json` with mode 0600.
Docker's root process can write the bind without changing ownership of existing
application directories.

Both ACME providers read only the directory selected by
`TRAEFIK_CERT_RESOLVER`. Production uses `letsencrypt/production.json`; staging
uses `staging/staging.json`. The other provider's file in each directory must
exist with zero bytes and mode 0600. Create missing files with `touch`; an empty
store is not a `{}` document or a deleted file. Preserve populated active files.
Traefik loads certificates from configured providers into a shared TLS
store, so merely changing the router resolver can keep serving saved staging
certificates and prevent production issuance. Separate directories prevent the
inactive mode's certificates from entering that store. When upgrading from the
old flat layout, privately copy existing `production.json` into
`letsencrypt/production.json` and existing `staging.json` into
`staging/staging.json`, preserving permissions and account data. Keep the flat
files for rollback; do not copy staging certificates into the production
directory or delete existing production state.

Use individual-hostname ACME HTTP-01 certificates, independently of DSM's
certificate renewal. Public TCP 80 must reach Traefik during issuance and
renewal. Test with Let's Encrypt staging and a separate storage file before
using production. Certificate verification must succeed without `curl -k`
before public HTTPS cutover. Account for DSM's own certificate renewal when
changing the public HTTP forwarding rule. Check DSM certificate expiry and
renew it before the validation window if needed. Keep that window short and
restore its original TCP 80 forwarding if HTTPS cutover is deferred. Once
Traefik permanently owns public TCP 80, DSM HTTP-01 renewal needs a separate
plan before DSM's certificate expires; the existing DSM HTTPS certificate is
only a time-limited rollback option.

Komodo watches `compose.yaml` and additional mounted configuration files.
Register additional files in `config_files`, with redeploy required for
Traefik, so the existing GitHub deployment workflow selects this stack when
they change. Preserve the shared Infisical pre-deploy hook.

## Existing route inventory

As of 2026-10-06 UTC, `/usr/syno/etc/www/ReverseProxy.json` contains 39 HTTPS
routes. Most point to repository-managed web
containers. The `seerr` and `overseerr` names both point to Seerr. External
routes include DSM, Komodo, Portainer, OpenCode, and T3 Code.

Several routes already return 502 before migration: `actual-ical-maluk`,
`actual-tap-py`, `firefly`, `freshrss`, `opencode`, and `t3code`. The existing
`minecraft` HTTPS rule targets a Minecraft TCP port, not an HTTP server, and
also returns 502. Preserve and report this baseline rather than restarting
retired services or treating game traffic as HTTP.

Sitebin and Reactive Resume publish only on NAS loopback. Traefik reaches
their containers directly through the shared network, preserving loopback
bindings as DSM fallback. Home Assistant, Pi-hole, and Plex retain host
networking. The Tailscale-only `easy-cli-proxy` is outside this migration.

Before routing Home Assistant, add Traefik's reserved address to its HTTP
trusted proxies while retaining the existing DSM loopback entry. See
`home-assistant/README.md`. Add the same reserved address to Reactive Resume's
Infisical `TRUSTED_PROXIES` while retaining its verified DSM bridge gateway.
These runtime settings preserve client attribution without trusting every
container on the shared network.

Register `dynamic/host-services.yaml` as a Komodo config dependency requiring
Traefik redeployment when the service migration PR reaches main. DSM's HTTPS
backend uses the public DSM hostname for TLS SNI and normal CA verification.
WebSocket upgrades pass through automatically; no hop-by-hop Upgrade or
Connection headers are forced. Open WebUI's streaming middleware sets response
headers, and no response buffering middleware is enabled.

## Deployment and cutover

1. Merge the documentation PR, then the infrastructure PR. Provision the
   `traefik` Komodo stack and runtime variables before its infrastructure merge
   so the normal GitHub workflow can deploy it. Verify the network, both
   containers, health, Docker API restrictions, and NAS compatibility.
2. Merge the service migration PR after the foundation is healthy. Verify the
   GitHub workflow and each affected Komodo stack. Preserve application data,
   database credentials, published ports, and existing URLs.
3. Test every hostname against Traefik directly, supplying the original Host
   header and TLS SNI. Verify backend responses, redirects, streaming,
   WebSockets, uploads, and any trusted-proxy settings that apply.
4. Record the UDM's existing TCP 80/443 forwarding rules and destinations
   privately before changing them. Switch public TCP 80 to Traefik in a controlled certificate-validation
   window. Obtain and verify production certificates for required routes.
5. Switch public TCP 443 only after all required routes pass. Verify from
   outside the LAN and from LAN clients. Keep DSM rules during observation.
6. Remove obsolete DSM rules or application ports only in a later cleanup.

## Rollback

Restore the UDM's previous forwarding destinations to put DSM back in front.
Existing DSM rules and published application ports remain available throughout
the migration. If an application network change causes a regression, revert
the service migration through a PR and verify its normal Komodo redeployment.
Retain Traefik's certificate state and all application data during rollback.

## Validation

Run `bun install --frozen-lockfile` and `bunx dclint . -r -c .dclintrc` before
pushing. Render changed Compose stacks with their normal runtime environment
when available; do not invent secrets to satisfy rendering. Record the
pre-migration and post-migration HTTP status for every inventoried hostname.
Expected login redirects or authentication responses count as reachability;
connection failures and unexpected proxy 5xx responses do not.

Use `python3 traefik/check-reachability.py --websockets --output results.json`
for the 39-hostname inventory and unauthenticated WebSocket handshakes. Retired
routes are reported separately and do not hide failures on active routes.
WebSocket 401/403 replies are marked `AUTH`: the route is reachable but its
upgrade still requires an authenticated check. Successful upgrades also require
the expected `Sec-WebSocket-Accept` response.
Before cutover, add `--connect NAS_IP --port 8443` to test Traefik directly with
the original Host header, TLS SNI and certificate verification. Run from both
an external client and the LAN. Keep results outside git; application sign-in,
authenticated uploads and streaming still require their own functional checks.
