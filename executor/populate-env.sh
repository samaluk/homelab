#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${INFISICAL_CLIENT_ID:?Missing INFISICAL_CLIENT_ID}"
: "${INFISICAL_CLIENT_SECRET:?Missing INFISICAL_CLIENT_SECRET}"
: "${INFISICAL_PROJECT_ID:?Missing INFISICAL_PROJECT_ID}"
: "${INFISICAL_DOMAIN:?Missing INFISICAL_DOMAIN}"

token="$(infisical login --method=universal-auth \
  --domain="${INFISICAL_DOMAIN}" \
  --client-id="${INFISICAL_CLIENT_ID}" \
  --client-secret="${INFISICAL_CLIENT_SECRET}" \
  --silent --plain --telemetry=false)"

tmp_env="$(mktemp .env.XXXXXX)"
trap 'rm -f -- "${tmp_env}"' EXIT

infisical export --token="${token}" \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --domain="${INFISICAL_DOMAIN}" \
  --env=prod --path=/executor --format=dotenv \
  --silent --telemetry=false > "${tmp_env}"

for name in EXECUTOR_WEB_BASE_URL EXECUTOR_BOOTSTRAP_ADMIN_EMAIL \
  EXECUTOR_BOOTSTRAP_ADMIN_PASSWORD BETTER_AUTH_SECRET EXECUTOR_SECRET_KEY; do
  if ! grep -qE "^${name}=" "${tmp_env}"; then
    echo "Infisical prod /executor is missing ${name}" >&2
    exit 1
  fi
done

mv -- "${tmp_env}" .env
unset token
echo '.env populated from Infisical prod /executor'
