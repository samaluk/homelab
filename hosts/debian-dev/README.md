# Debian Komodo server

`debian-dev` is a second server in the existing Synology-hosted Komodo instance.
It runs Docker Compose workloads through Komodo, alongside K3s for GitHub
Actions runners and PicPeak. Komodo does not manage or list K3s containers.

## Runtime and connectivity

- SSH: `ssh debian-dev`.
- Debian 13, Core i7-8700K, 16 GB RAM.
- Docker Engine 29.9.1 and Compose plugin 5.6.0 were installed from Docker's
  official Debian repository during onboarding.
- Komodo Periphery **v2.2.0**, matching Core, runs as the root systemd service
  `periphery.service`. Root access lets the agent manage Docker and Compose.
- Periphery connects outbound to `ws://100.121.250.33:9120` over Tailscale,
  authenticates with its own X25519 key, and pins Core's public key. Komodo's
  Noise protocol authenticates and encrypts the connection in addition to
  Tailscale. There is no inbound Periphery listener or new published port.
- Komodo's `debian-dev` server is enabled with its address unset (outbound
  mode), system monitoring enabled, and automatic image pruning disabled.

K3s uses `/run/k3s/containerd/containerd.sock`; Docker uses its own containerd.
Do not replace K3s's runtime or migrate its workloads as part of a Compose
deployment. Docker's configuration preserves the host's forwarding policy
with `ip-forward-no-drop`, so K3s and Tailscale forwarding continue to work.
The `local` logging driver rotates new Docker container logs.

## Bootstrap files

These files describe the manually bootstrapped host; the stack redeployment
workflow does not apply them. Review changes through a PR, then apply them
explicitly during authorized host maintenance:

- `docker-daemon.json` → `/etc/docker/daemon.json`.
- `periphery.config.toml` → `/etc/komodo/periphery.config.toml`.
- `periphery.service` → `/etc/systemd/system/periphery.service`.

Install the Docker configuration **before first starting Docker**. Follow
[Docker's Debian installation instructions](https://docs.docker.com/engine/install/debian/)
for its signed package repository and install `docker-ce`, `docker-ce-cli`,
`containerd.io`, `docker-buildx-plugin`, and `docker-compose-plugin`. Review
APT's proposed changes first; it must not remove the existing K3s runtime.
Do not install Debian's `docker.io` alongside Docker CE.

For Periphery, download the pinned
[`periphery-x86_64` v2.2.0 release](https://github.com/moghtech/komodo/releases/tag/v2.2.0),
verify its SHA-256, and install it as `/usr/local/bin/periphery` with mode 0755:

```text
ace9007805dbfe75ad73c75c36bb26852fa909d825577f31f5d13eecd3c52660
```

Create `/etc/komodo/keys` as root with mode 0700. On a fresh host, generate
`periphery.key` with `openssl genpkey -algorithm X25519` and restrict it to
mode 0600. Preserve an existing key; replacing it requires updating Komodo's
expected server public key. Obtain the public key for registration with:

```bash
sudo openssl pkey -in /etc/komodo/keys/periphery.key -pubout -outform DER | base64 -w0
```

Create the `debian-dev` server in Komodo using that public key and the settings
above. Copy Core's verified public key from Komodo into
`/etc/komodo/keys/core.pub`, as a PEM public key or base64 DER **without a
trailing newline**. Keep private keys, API credentials, and onboarding keys
off Git and out of logs. No shared passkey or onboarding key is needed.

Install the agent configuration as root with mode 0600 and the systemd unit
with mode 0644. Run `systemd-analyze verify` on the unit, then
`systemctl daemon-reload` and `systemctl enable --now periphery`.

## Adding a Compose stack

Add the service's Compose file and runbook to this repository as usual. Create
its Komodo stack with server **`debian-dev`**, repository `samaluk/homelab`,
branch `main`, and the service's run directory. Keep credentials in the matching
Infisical folder or Komodo variables. Merge source changes through a PR so
the normal workflow deploys them to the selected server.

Use Debian paths for persistent data, such as `/srv/<stack>`; `/volume1` is a
Synology path. Keep SQLite and other database files on local disk. Route
services through an explicit backend if using the NAS's Traefik: its Docker
discovery and `homelab-proxy` network are local to the NAS.

## Verification and recovery

Use the repository's Komodo client, with credentials injected through
Infisical and Varlock, to confirm `debian-dev` appears under `servers` and that
`containers debian-dev` succeeds. An empty list is expected before the first
Docker workload. In Komodo, the server should show **OK**, version **2.2.0**,
and live host statistics.

For host checks over SSH:

```bash
sudo systemctl status periphery docker
sudo journalctl -u periphery --since '10 minutes ago'
sudo dockerd --validate --config-file=/etc/docker/daemon.json
sudo iptables -S FORWARD
sudo ss -lnt 'sport = :8120'
sudo k3s kubectl get nodes
sudo k3s kubectl get pods -A
curl -I --max-time 10 http://192.168.1.66:3900/
```

The forwarding policy should remain `ACCEPT`; port 8120 should have no listener.
K3s should remain Ready with its existing pods healthy, and PicPeak should
respond on port 3900 (a login redirect is normal). Onboarding was verified with
unchanged pod restart counts and successful cluster-IP and LAN HTTP responses.

If Debian disconnects, inspect Periphery's journal and Tailscale reachability
first. Preserve `/etc/komodo/keys`, stack files under `/etc/komodo`, and
application data under `/srv`. A Periphery restart does not restart application
containers. Coordinate Docker restarts separately because they may interrupt
Compose workloads. Review agent upgrades alongside the installed Core version
and verify the new release checksum before replacing the binary.
