# Traefik ingress

Traefik replaces DSM's HTTPS reverse proxy while retaining Synology DDNS and
the existing `*.malukzedan.synology.me` application URLs. Komodo deploys the
`traefik` stack from this repository's `main` branch once the infrastructure PR
lands. This document describes the planned migration; the Compose stack,
Komodo resource, Infisical folder, and root README entries arrive with that PR.

## Migration architecture

Traefik publishes HTTP on NAS port **8880** and HTTPS on **8443** so it can run
beside DSM. The UDM eventually forwards public TCP **80 → NAS:8880** and
**443 → NAS:8443**. Check LAN hairpin access and any local DNS overrides before
switching HTTPS. Keep DSM's existing rules and application port bindings for
rollback; changing router forwarding is a separate operational step.

Application containers opt in with `traefik.enable=true`, explicit hostname
rules and internal backend ports. They join the external `homelab-proxy`
network while retaining their existing default/private networks. Databases and
worker containers stay on their original networks. Traefik creates the shared
network before application migration; do not run Compose down on its stack
while applications use that network.

The Docker provider talks to a restricted socket proxy on a separate internal
network. Only the socket proxy mounts the Docker socket. Discovery permits
read requests needed to inspect containers and follow events, with write
requests disabled. The dashboard is disabled.

Host-network applications, DSM, Komodo, Portainer, and services on other LAN
machines use explicitly configured file-provider backends. Preserve their
existing access policy and HTTPS backend verification. Do not change a
host-network application's network mode just to integrate the proxy.

## Certificates and configuration

Store runtime configuration in Infisical **prod /traefik**, matching the stack
name. Keep certificate accounts and private keys under
`/volume1/docker/traefik`; never commit them or expose them in logs.
Traefik runs as container root (UID/GID 0:0). Pre-create its state directory
with mode 0700 and ACME JSON files with mode 0600; Docker's root process can
write the bind without changing ownership of existing application directories.

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
