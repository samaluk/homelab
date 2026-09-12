#!/bin/sh
set -eu
umask 077

# Only a DNS hostname is valid here; never interpolate arbitrary nginx syntax.
case "${SITEBIN_HOST:-}" in
  ''|*[!a-zA-Z0-9.-]*) echo 'SITEBIN_HOST must be a DNS hostname' >&2; exit 1 ;;
esac
# Infisical's normal export expands dollar signs. Base64 preserves bcrypt while
# keeping the existing Komodo environment template unchanged.
SITEBIN_OWNER_HTPASSWD="$(printf '%s' "${SITEBIN_OWNER_HTPASSWD_B64:?Missing owner credential}" | base64 -d)"
case "$SITEBIN_OWNER_HTPASSWD" in
  owner:\$2[aby]\$*) ;;
  *) echo 'Decoded owner credential must contain owner:<bcrypt hash>' >&2; exit 1 ;;
esac
printf '%s\n' "$SITEBIN_OWNER_HTPASSWD" > /tmp/owner.htpasswd
unset SITEBIN_OWNER_HTPASSWD SITEBIN_OWNER_HTPASSWD_B64
envsubst '${SITEBIN_HOST}' < /etc/sitebin/nginx.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
