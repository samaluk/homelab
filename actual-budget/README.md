# Actual Budget Stack

This stack runs Actual Budget and related helpers on the Synology host.

## Services

- `actual-server`: Actual Budget server.
- `actual-ical`: calendar export helper.
- `actualtap`: Actual Tap integration.
- `fintual-api`: long-lived idle Fintual worker container, normally running `sleep infinity`.
- `ofelia`: scheduler that executes `./bin/run-sync.sh` inside `fintual-api`.

The scheduled Fintual sync output usually appears in `ofelia` logs, not `fintual-api` logs, because Ofelia captures job stdout.

## Fintual Sync Inspection

Check the running Fintual container and image:

```bash
ssh synology "sudo -n /usr/local/bin/docker ps -a --filter name=fintual-api --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.CreatedAt}}'"
```

Inspect container state:

```bash
ssh synology "sudo -n /usr/local/bin/docker inspect fintual-api --format 'Started={{.State.StartedAt}} Finished={{.State.FinishedAt}} Status={{.State.Status}} ExitCode={{.State.ExitCode}} RestartCount={{.RestartCount}} Image={{.Config.Image}}'"
```

Read recent scheduler logs:

```bash
ssh synology "sudo -n /usr/local/bin/docker logs --since 96h --timestamps ofelia"
```

Read recent target container logs. Empty output can be normal for scheduled runs:

```bash
ssh synology "sudo -n /usr/local/bin/docker logs --since 96h --timestamps fintual-api"
```

## Manual Fintual Sync

Run the same sync command documented by the Fintual API local compose workflow, but inside the production container:

```bash
ssh synology "sudo -n /usr/local/bin/docker exec fintual-api ./bin/run-sync.sh"
```

Use a longer command timeout because Fintual login, Gmail IMAP 2FA retrieval, and Actual Budget sync can take over a minute.

## Interpreting A Fintual Sync Run

For scheduled runs, use the latest `ofelia` `Job stop` entry for `job=fintual-sync`.

Check these fields:

- `failed=false` and `skipped=false` indicate Ofelia considered the job successful.
- `duration` reports runtime.
- `stdout` includes Fintual login, Gmail IMAP 2FA retrieval, Actual Budget loading/sync, and transaction counts.
- Successful Actual sync output looks like `Actual sync finished. Created N transactions, updated M, and deleted D duplicates.`
- `docker inspect fintual-api` should show `Status=running`, `ExitCode=0`, and an expected `RestartCount`.
