#!/usr/bin/env bash
set -euo pipefail
umask 077

data_dir=/srv/executor-v2
backup_root=/srv/backups/executor
compose=(docker compose -f compose.yaml)
target_image="$("${compose[@]}" config --images)"
if [[ ! "$target_image" =~ ^ghcr\.io/usefulsoftwareco/executor-selfhost:[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
  echo 'Expected one pinned Executor self-host image' >&2
  exit 1
fi

container="$(docker container ls --all --quiet --no-trunc --filter 'name=^/executor$')"
old_image=
was_running=false
if [[ -n "$container" ]]; then
  read -r old_image was_running < <(
    docker container inspect --format '{{.Config.Image}} {{.State.Running}}' "$container"
  )
  if [[ "$old_image" == "$target_image" ]]; then
    exec "$@"
  fi
else
  first_entry=
  if [[ -d "$data_dir" ]]; then
    first_entry="$(find "$data_dir" -mindepth 1 -maxdepth 1 -print -quit)"
  fi
  if [[ -z "$first_entry" ]]; then
    exec "$@"
  fi
fi

# Komodo pulls the target before running this wrapper. Check before downtime.
docker image inspect "$target_image" >/dev/null
test -s "$data_dir/encryption.key"
install -d -m 0700 "$backup_root"
staging="$(mktemp -d "$backup_root/.executor-backup.XXXXXXXX")"
restart_old=false

cleanup() {
  local result=$?
  if (( result != 0 )) && [[ "$restart_old" == true ]] &&
    [[ "$(docker container inspect --format '{{.State.Running}}' "$container" 2>/dev/null)" == false ]]; then
    docker container start "$container" >/dev/null ||
      echo 'Could not restart the previous Executor container' >&2
  fi
  rm -rf -- "$staging"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n "$container" ]]; then
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" |
    grep -E '^BETTER_AUTH_(SECRET|URL)=.+' > "$staging/session.env"
  printf '%s\n' "$old_image" > "$staging/image"
else
  # A prior Compose failure may have removed the container before replacing it.
  "${compose[@]}" config --environment |
    awk '/^BETTER_AUTH_SECRET=/{print} /^EXECUTOR_WEB_BASE_URL=/{sub(/^EXECUTOR_WEB_BASE_URL=/,"BETTER_AUTH_URL="); print}' > "$staging/session.env"
  printf '%s\n' 'unknown (previous container absent)' > "$staging/image"
fi
grep -q '^BETTER_AUTH_SECRET=.' "$staging/session.env"
grep -q '^BETTER_AUTH_URL=.' "$staging/session.env"

if [[ "$was_running" == true ]]; then
  restart_old=true
  docker container stop --time 30 "$container" >/dev/null
fi

archive="executor-v2-before-update-$(date -u +%Y%m%dT%H%M%SZ)-${staging##*.}.tar.gz"
tar -czf "$staging/$archive" -C /srv executor-v2 -C "$staging" image session.env
tar -tzf "$staging/$archive" >/dev/null
if [[ -n "$container" ]]; then
  test "$(docker container inspect --format '{{.State.Running}}' "$container")" = false
fi
mv -- "$staging/$archive" "$backup_root/$archive"
printf 'Saved Executor backup to %s/%s\n' "$backup_root" "$archive"

"$@"
find "$backup_root" -maxdepth 1 -type f -name 'executor-v2-before-update-*.tar.gz' -mtime +30 -delete ||
  echo 'Could not prune expired automatic Executor backups' >&2
