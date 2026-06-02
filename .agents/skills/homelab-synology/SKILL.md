---
name: homelab-synology
description: Use this skill when working in this homelab repo and needing to inspect, debug, or manually operate Docker Compose stacks on the Synology host. Trigger this for prompts about Synology, Container Manager, remote Docker logs, container status, or manually executing commands inside homelab containers. For Komodo deploys, restarts, stack logs, or Komodo secrets, use homelab-komodo instead. Load stack-specific README files from the relevant service folder before acting on service-specific details.
---

# Homelab Synology

This repo deploys Docker Compose stacks to the user's Synology host via Komodo. Use **homelab-komodo** for deploy/restart/pull and Komodo-side config; use this skill for SSH + Docker inspection on the host, then read stack-local documentation for service-specific commands.

The **Komodo Core + Periphery** stack is managed only on the NAS at `/volume1/docker/komodo` (`ferretdb.compose.yaml`, `compose.env`) — not tracked in git.

## Workflow

1. Identify the stack folder from the user's prompt or by searching the repo.
2. Read that folder's `README.md` if present.
3. Read the stack's `compose.yaml` to confirm service names, container names, commands, labels, and schedules.
4. Use the Synology Docker commands below to inspect or operate the live deployment.
5. If local compose files differ from the live container image/version, check whether the local branch is stale before assuming deployment drift.

## Connection

The Synology host is configured as the SSH alias `synology` in `~/.ssh/config`.

```bash
ssh synology "id && uname -a"
```

Synology non-interactive shells may not include Docker on `PATH`. Prefer the full Docker binary path:

```bash
ssh synology "/usr/local/bin/docker ps"
```

If Docker returns permission denied for `/var/run/docker.sock`, retry with non-interactive sudo:

```bash
ssh synology "sudo -n /usr/local/bin/docker ps"
```

The user can have command-specific sudo access even when `sudo -n true` says a password is required, so test the Docker command itself before concluding sudo is unavailable.

Useful discovery commands:

```bash
ssh synology "command -v docker || command -v podman || command -v container-manager || ls /usr/local/bin/docker /var/packages/ContainerManager/target/usr/bin/docker /var/packages/Docker/target/usr/bin/docker 2>/dev/null"
ssh synology "id && uname -a"
```

## Docker Inspection

List containers for a service or stack by name:

```bash
ssh synology "sudo -n /usr/local/bin/docker ps -a --filter name=<name> --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.CreatedAt}}'"
```

Inspect container lifecycle state:

```bash
ssh synology "sudo -n /usr/local/bin/docker inspect <container> --format 'Started={{.State.StartedAt}} Finished={{.State.FinishedAt}} Status={{.State.Status}} ExitCode={{.State.ExitCode}} RestartCount={{.RestartCount}} Image={{.Config.Image}}'"
```

Read recent logs:

```bash
ssh synology "sudo -n /usr/local/bin/docker logs --since 96h --timestamps <container>"
```

Follow logs when actively debugging:

```bash
ssh synology "sudo -n /usr/local/bin/docker logs -f --timestamps <container>"
```

Execute a command inside a running container:

```bash
ssh synology "sudo -n /usr/local/bin/docker exec <container> <command>"
```

Use longer command timeouts for manual jobs that perform network login, email polling, imports, media scans, or other long-running work.

## Scheduler Pattern

Some stacks use a scheduler container to execute jobs inside a long-lived worker container. In that pattern, the target service logs can be empty because the scheduler captures job stdout.

When debugging scheduled jobs:

- Read the target service definition in `compose.yaml` for the container name and command.
- Read scheduler labels or configuration to find the job name, command, and schedule.
- Check both the scheduler container logs and the target container logs.
- Treat the scheduler's job stop entry as the source of truth for captured stdout, duration, skipped state, and failed state.

## Stack Documentation

Service-specific runbooks belong in each stack folder, not in this generic skill. Before executing service-specific commands, read the relevant stack README, for example:

```bash
actual-budget/README.md
```
