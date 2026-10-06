# homelab

Docker Compose stacks for a personal Synology NAS, deployed with [Komodo](https://komo.do). Each service lives in its own directory with a `compose.yaml`.

## Stacks

| Directory | Service |
|-----------|---------|
| `actual-budget` | Actual Budget, iCal export, Fintual sync |
| `bazarr` | Bazarr subtitles |
| `bentopdf` | BentoPDF |
| `changedetection` | ChangeDetection.io |
| `easy-cli-proxy` | Shared AI subscription gateway and scoped catalog sync over Tailscale |
| `home-assistant` | Home Assistant |
| `icloudpd` | iCloud Photos sync |
| `immich` | Immich photo library |
| `infisical` | Infisical secrets manager |
| `jellyfin` | Jellyfin media server |
| `jellyplex-watched` | Jellyfin/Plex watch-state sync |
| `lidarr` | Lidarr music |
| `maintainerr` | Maintainerr |
| `minecraft` | Minecraft (PaperMC) |
| `miniflux` | Miniflux RSS reader |
| `ntfy` | ntfy notifications |
| `open-webui` | Open WebUI |
| `pihole` | Pi-hole DNS |
| `plex` | Plex |
| `prowlarr` | Prowlarr indexer manager |
| `qbittorrent` | qBittorrent |
| `radarr` | Radarr movies |
| `reactive-resume` | Reactive Resume builder |
| `seerr` | Seerr requests |
| `sitebin` | HTML reports with per-report passwords and expiry |
| `sonarr` | Sonarr TV |
| `tautulli` | Tautulli Plex stats |
| `tdarr` | Tdarr transcoding |
| `trek` | Trek |
| `uptime-kuma` | Uptime Kuma |
| `wizarr` | Wizarr invites |

## Deployment

Stacks are deployed on a Synology NAS through Komodo. Compose files use environment variable placeholders; values are injected at deploy time from [Infisical](https://infisical.com) (self-hosted) or Komodo stack variables.

Local development and agent tooling use the Komodo API client under
`.agents/skills/homelab-komodo/`. Infisical loads `KOMODO_URL`, `KOMODO_API_KEY`,
and `KOMODO_API_SECRET` into the command's environment; [Varlock](https://varlock.dev/)
validates them against the committed `.env.schema` before starting the client.
The schema contains variable names and validation rules, with no secret values.
API credentials are marked sensitive, and the command redacts matching values
from captured stdout/stderr. Interactive terminal output uses TTY passthrough.
This does not isolate the client process from the credentials it uses.

To share client credentials across machines, store them in Infisical
`prod /homelab-admin`, separate from stack deployment secrets. Authenticate the
Infisical CLI on each machine, then fetch the credentials for a command without
exporting a secrets file:

```bash
bun install --frozen-lockfile
infisical login --domain=https://infisical.malukzedan.synology.me --profile=homelab
infisical run --domain=https://infisical.malukzedan.synology.me \
  --profile=homelab --projectId=YOUR_PROJECT_ID --env=prod \
  --path=/homelab-admin --silent --telemetry=false -- bun run komodo version
```

Use the project ID shown in Infisical. For unattended tooling, use a dedicated
machine identity with access limited to the folders it needs. NAS SSH access
is configured separately; each machine can keep its own private key. Varlock
uses the existing CLI authentication here, so no additional bootstrap credentials
or secrets files are needed. Substitute `stacks`, `services <stack>`, or another
client command for `version`.

The direct Bun CLI still accepts all three injected variables together and
supports the legacy gitignored repo-root `.env` when none are injected. Use
the `bun run komodo` wrapper for Varlock validation and output redaction.

## Secrets (Infisical)

Secrets are organized in Infisical with **one folder per stack**, matching this repo's directory names (e.g. `/jellyfin`, `/open-webui`). Set values in the `prod` environment (or whichever environment your Komodo stacks use).

Stacks with required secrets beyond host bind-mount paths:

| Folder | Variables |
|--------|-----------|
| `actual-budget` | `ACTUAL_*`, `FINTUAL_*`, `GMAIL_*` |
| `icloudpd` | `APPLE_USERNAME`, `ICLOUD_DATA_PATH`, `ICLOUD_SHARED_LIBRARY_ID` |
| `immich` | `DB_*`, `UPLOAD_LOCATION`, `ICLOUD_EXTERNAL_LIBRARY_PATH` |
| `jellyfin` | `JELLYFIN_PUBLISHED_SERVER_URL` |
| `jellyplex-watched` | `JELLYFIN_*`, `PLEX_*`, sync tuning vars |
| `lidarr` | `POSTGRES_PASSWORD` |
| `miniflux` | `POSTGRES_*`, `ADMIN_*` |
| `open-webui` | `WEBUI_SECRET_KEY`, `WEBUI_URL`, `CORS_ALLOW_ORIGIN` |
| `pihole` | `PIHOLE_WEB_PASSWORD` |
| `reactive-resume` | `APP_URL`, `POSTGRES_PASSWORD`, `AUTH_SECRET`, optional `SMTP_*` |
| `sitebin` | `SITEBIN_HOST` |
| `tdarr` | `TDARR_SERVER_IP` |
| `trek` | `APP_URL` |

Never commit `.env` files or secret values to git.

### Rotating database passwords

When `POSTGRES_PASSWORD` changes for an existing volume (Lidarr, Miniflux), update the password inside the running database before redeploying, or recreate the data volume:

```bash
# Example for Lidarr's Postgres container
docker exec -it lidarr-db psql -U lidarr -c "ALTER USER lidarr PASSWORD 'new-password';"
```

Pi-hole picks up `PIHOLE_WEB_PASSWORD` on container restart.

## Linting

Compose files are linted in CI with [dclint](https://github.com/zavoloklom/dclint):

```bash
bun install
bunx dclint . -r -c .dclintrc
```

## License

[MIT](LICENSE)
