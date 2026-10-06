# Reactive Resume

[Reactive Resume](https://github.com/reactive-resume/reactive-resume) with a
dedicated PostgreSQL 17 database and local upload storage. PDF export runs in
the browser. Optional Redis-backed AI Agent workspace and S3 storage are not
enabled.

## Runtime configuration

Komodo stack `reactive-resume` tracks this repository's `main` branch,
run directory `reactive-resume`, and watched file `compose.yaml`. It uses
`env_template`'s pre-deploy hook to populate `.env` from Infisical
**prod /reactive-resume**, matching the stack directory. Keep the template's
hook unchanged and leave Komodo's stack environment empty.

| Variable | Value |
|----------|-------|
| `APP_URL` | `https://resume.malukzedan.synology.me` |
| `POSTGRES_PASSWORD` | Generate a unique password with `openssl rand -hex 32` |
| `AUTH_SECRET` | Generate a separate secret with `openssl rand -hex 32` |
| `TRUSTED_PROXIES` | Required for v6; comma-separated verified proxy IPs (see below), including Traefik's reserved `TRAEFIK_PROXY_IP` |
| `FLAG_DISABLE_SIGNUPS` | Optional; defaults to `false`, set to `true` after creating the intended accounts |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Optional email delivery configuration |

For an existing installation, preserve the current `POSTGRES_PASSWORD` and
`AUTH_SECRET` when moving them into Infisical; generate new values only for a
fresh installation. Changing the secret store does not rotate the database
role password.

Use a hex database password because it is interpolated into a PostgreSQL URL.
Store secrets only in Infisical, never in git. Without SMTP, verification and
reset emails
are written to application logs; treat those logs as sensitive.

## NAS setup

The existing directories are mounted as follows:

| NAS path | Container path | Contents |
|----------|----------------|----------|
| `/volume1/docker/reactive-resume/data` | `/app/data` | Uploaded files |
| `/volume1/docker/reactive-resume/postgres` | `/var/lib/postgresql/data` | PostgreSQL 17 database |

The app image runs as UID/GID `1000:1000`. Before the first deployment, ensure
the upload directory is writable by that user:

```sh
sudo chown 1000:1000 /volume1/docker/reactive-resume/data
sudo chmod 0700 /volume1/docker/reactive-resume/data
```

PostgreSQL initializes its directory and ownership on first startup. Do not
replace an existing database directory or change its major version in place.
The mount targets PostgreSQL 17's actual data directory, avoiding an anonymous
volume. Renovate database major upgrades are disabled for this stack.

Traefik routes HTTPS `resume.malukzedan.synology.me` directly to the app's port
3000 through `homelab-proxy`. The app also retains its default network for
PostgreSQL. Keep DSM's existing loopback route to `127.0.0.1:8091` during the
rollback window. PostgreSQL has no published host port and does not join the
proxy network.

For v6, set `TRUSTED_PROXIES` in Infisical **prod /reactive-resume** before
merging the upgrade. Confirm the immediate peer address seen inside the app
container during a request through DSM: Docker's loopback port forwarding can
make the peer a bridge gateway rather than `127.0.0.1`. Trust that specific
address (and any verified intermediate proxy hops), using exact IPs or narrow
CIDRs. Do not trust public client networks or all private networks.

The current DSM server block in
`/etc/nginx/sites-enabled/server.ReverseProxy.conf` uses
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, which appends the
actual client address to any incoming header. It also sets `X-Real-IP` to
`$remote_addr` and `X-Forwarded-Proto` to `$scheme`. During a request through
the public HTTPS endpoint, the app's TCP connection peer was verified as
`192.168.128.1`, the gateway of `reactive-resume_default`. Infisical's
`TRUSTED_PROXIES` must retain that exact IP during the rollback window and add
Traefik's reserved `TRAEFIK_PROXY_IP` from Infisical **prod /traefik** before
the migration deploy. Verify that peer after deployment; do not broaden trust
to all private networks or the shared proxy subnet.

v6 uses the trusted proxy chain for per-visitor API and authentication rate
limits, stopping at the first untrusted client hop. Repeat the peer and
forwarded-header checks if the Docker network or proxy topology changes, and
update Infisical before redeploying. Compose refuses to deploy without
`TRUSTED_PROXIES`.

Merge the stack PR into `main` to trigger the normal Komodo deployment workflow.
Verify both containers are healthy, then check `/api/health` through the public
URL and create the initial account. App startup runs database migrations.

## Backups and upgrades

Back up both the uploads directory and the database (using `pg_dump` for a live
database). Preserve `AUTH_SECRET` and the database password. Take a backup before
application upgrades because startup can migrate the schema. Database password
rotation also requires changing the database role password; changing Infisical
alone does not update an initialized database.

Upstream deployment reference:
<https://docs.rxresu.me/self-hosting/docker>.
