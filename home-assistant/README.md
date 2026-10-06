# Home Assistant

Home Assistant retains host networking for device discovery. Traefik's file
provider connects to its existing NAS HTTP port 8123; do not attach this
container to `homelab-proxy` or change its network mode.

## Reverse proxy configuration

In Home Assistant's HTTP settings, keep **Trust X-Forwarded-For** enabled and
add the exact reserved `TRAEFIK_PROXY_IP` from Infisical **prod /traefik** to
**Trusted proxies**. Retain the existing `127.0.0.1/32` entry for DSM rollback.
Do not trust the whole proxy subnet. Confirm the saved settings after Home
Assistant restarts and verify `/api/websocket` upgrades through Traefik.

This installation stores HTTP settings in `/config/.storage/http`; absence of
an `http:` block in `configuration.yaml` does not mean proxy trust is disabled.
Preserve the rest of Home Assistant's configuration and data. Back up HTTP
settings privately before an operational change. Use Komodo for any required
restart and verify the existing DSM endpoint remains available.

Upstream reference: <https://www.home-assistant.io/integrations/http/#reverse-proxies>.
