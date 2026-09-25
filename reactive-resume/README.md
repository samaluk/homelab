# Reactive Resume

[Reactive Resume](https://github.com/reactive-resume/reactive-resume) with a
dedicated PostgreSQL 17 database and local upload storage. PDF export runs in
the browser. Optional Redis-backed AI Agent workspace and S3 storage are not
enabled.

## Runtime configuration

Komodo stack `reactive-resume` tracks this repository's `main` branch,
run directory `reactive-resume`, and watched file `compose.yaml`. It uses
`no_env_template` with configuration in Komodo, because the current Infisical
deployment identity cannot create folders. The pre-deploy hook is empty.
`POSTGRES_PASSWORD` references the Komodo secret `REACTIVE_RESUME_POSTGRES_PASSWORD`;
`AUTH_SECRET` references `REACTIVE_RESUME_AUTH_SECRET`. The stack environment also
sets `APP_URL`.

| Variable | Value |
|----------|-------|
| `APP_URL` | `https://resume.malukzedan.synology.me` |
| `POSTGRES_PASSWORD` | Generate a unique password with `openssl rand -hex 32` |
| `AUTH_SECRET` | Generate a separate secret with `openssl rand -hex 32` |
| `FLAG_DISABLE_SIGNUPS` | Optional; defaults to `false`, set to `true` after creating the intended accounts |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Optional email delivery configuration |

Use a hex database password because it is interpolated into a PostgreSQL URL.
Store secrets in Komodo secret variables, never in git. Without SMTP, verification and reset emails
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

Configure DSM's reverse proxy with HTTPS `resume.malukzedan.synology.me:443`
forwarding to HTTP `127.0.0.1:8091`, preserving the host and forwarded protocol
headers. Assign a certificate covering the hostname and ensure DNS resolves to
the NAS's public ingress. PostgreSQL has no published host port.

Merge the stack PR into `main` to trigger the normal Komodo deployment workflow.
Verify both containers are healthy, then check `/api/health` through the public
URL and create the initial account. App startup runs database migrations.

## Backups and upgrades

Back up both the uploads directory and the database (using `pg_dump` for a live
database). Preserve `AUTH_SECRET` and the database password. Take a backup before
application upgrades because startup can migrate the schema. Database password
rotation also requires changing the database role password; changing the Komodo secret
alone does not update an initialized database.

Upstream deployment reference:
<https://docs.rxresu.me/self-hosting/docker>.
