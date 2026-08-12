# Actual Budget Stack

This stack runs Actual Budget and related helpers on the Synology host.

## Services

- `actual-server`: Actual Budget server.
- `actual-ical`: calendar export helper.
- `actualtap`: Actual Tap integration.
- `fintual-api`: long-lived Fintual worker container running the in-process cron scheduler (`SYNC_CRON`).

The scheduled Fintual sync output appears in `fintual-api` logs, along with the scheduler's own messages.

## Fintual Sync Inspection

Check the running Fintual container and image:

```bash
ssh synology "sudo -n /usr/local/bin/docker ps -a --filter name=fintual-api --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.CreatedAt}}'"
```

Inspect container state:

```bash
ssh synology "sudo -n /usr/local/bin/docker inspect fintual-api --format 'Started={{.State.StartedAt}} Finished={{.State.FinishedAt}} Status={{.State.Status}} ExitCode={{.State.ExitCode}} RestartCount={{.RestartCount}} Image={{.Config.Image}}'"
```

Read recent scheduler logs (scheduled sync runs appear here too):

```bash
ssh synology "sudo -n /usr/local/bin/docker logs --since 96h --timestamps fintual-api"
```

## Manual Fintual Sync

Run the same command the scheduler runs on schedule:

```bash
ssh synology "sudo -n /usr/local/bin/docker exec fintual-api ./bin/run-sync.sh"
```

Use a longer command timeout because Fintual login, Gmail IMAP 2FA retrieval, and Actual Budget sync can take over a minute.

Do not use Komodo Actions for this job on the Synology host. Komodo Actions run through Deno in `komodo-core`, and this machine can abort with `getentropy failed` on its older kernel.

## Interpreting A Fintual Sync Run

For scheduled runs, inspect the latest sync output in the `fintual-api` logs.

Check these fields:

- A tick skipped because the previous run was still in progress logs `Skipping scheduled run; a previous run is still in progress`.
- A failed scheduled run logs `Scheduled run failed`.
- Each run's output includes Fintual login, Gmail IMAP 2FA retrieval, Actual Budget loading/sync, and transaction counts.
- Successful Actual sync output looks like `Actual sync finished. Created N transactions, updated M, and deleted D duplicates.`
- `docker inspect fintual-api` should show `Status=running`, `ExitCode=0`, and an expected `RestartCount`.
