# Miniflux Postgres 18 Upgrade

This stack originally stored PostgreSQL data directly under `/volume1/docker/miniflux` and mounted it at `/var/lib/postgresql/data`.

Postgres 18 changes the default layout to use versioned subdirectories under `/var/lib/postgresql`, so this upgrade needs a one-time data move plus a `pg_upgrade`.

Target end state:

- Compose mounts `/volume1/docker/miniflux` at `/var/lib/postgresql`
- Postgres 17 data lives in `/volume1/docker/miniflux/17/docker`
- Postgres 18 data lives in `/volume1/docker/miniflux/18/docker`

## 1. Stop the stack

Run on the host that has the Miniflux data volume:

```bash
docker compose -f miniflux/compose.yaml down
```

## 2. Back up the database directory

Create a filesystem backup before changing anything:

```bash
cd /volume1/docker
cp -a miniflux miniflux.backup-$(date +%Y%m%d-%H%M%S)
```

## 3. Move the existing Postgres 17 data into the new parent layout

The old setup stored the database files directly in `/volume1/docker/miniflux`.
Move them into `17/docker` while keeping the backup from the previous step intact.

```bash
mkdir -p /volume1/docker/miniflux/17/docker

find /volume1/docker/miniflux \
  -mindepth 1 \
  -maxdepth 1 \
  ! -name 17 \
  ! -name 18 \
  -exec mv {} /volume1/docker/miniflux/17/docker/ \;
```

After this, `PG_VERSION` should exist at:

```bash
ls -l /volume1/docker/miniflux/17/docker/PG_VERSION
```

## 4. Run the major upgrade

Use the upgrade helper image from Docker Hub:

```bash
docker run --rm \
  -v /volume1/docker/miniflux:/var/lib/postgresql \
  tianon/postgres-upgrade:17-to-18 \
  --link
```

That should create the new 18 cluster under `/volume1/docker/miniflux/18/docker`.

## 5. Deploy the repo change that switches Miniflux to Postgres 18

This branch updates the compose file to:

- use `postgres:18-alpine`
- mount `/volume1/docker/miniflux` at `/var/lib/postgresql`

Merge the PR only after the previous steps succeed.

## 6. Start the stack again

```bash
docker compose -f miniflux/compose.yaml up -d
```

Miniflux already has `RUN_MIGRATIONS=1`, so the app migrations will run on startup.

## 7. Verify

```bash
docker logs miniflux-db --tail 100
docker logs miniflux-web --tail 100
```

Check that:

- Postgres starts cleanly on version 18
- Miniflux connects successfully
- The app UI loads and existing feeds/users are present

## Rollback

If the upgrade fails before the PR is merged:

- keep the compose file on Postgres 17
- restore `/volume1/docker/miniflux` from the backup copy

If the upgrade fails after the PR is merged:

1. restore the backup directory
2. roll the repo back to commit `0b42927`
3. redeploy the stack
