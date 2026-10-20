# Tinyauth

[Tinyauth](https://tinyauth.app/docs/guides/oidc/) is a reusable private
OpenID Connect provider for self-hosted applications. It supports local
password accounts and optional TOTP, running in one container with SQLite
and persistent signing keys. No cloud OAuth account, SMTP service, or
separate database is required.

## Deploy

Create Komodo stack `tinyauth` from the shared `env_template`, tracking
`homelab/main`, directory `tinyauth`, and watching only `compose.yaml`.
Preserve the template's Infisical pre-deploy hook, disable image auto-updates,
and store configuration in Infisical **prod /tinyauth**. Register the stack
before merge so the normal GitHub workflow can deploy it.

| Variable | Value or purpose |
|----------|------------------|
| `TINYAUTH_HOST` | `auth.malukzedan.synology.me`, without scheme or path |
| `TINYAUTH_TRUSTED_PROXIES` | `172.16.10.2`, the existing Traefik address |
| `TINYAUTH_USERS_BASE64` | Base64-encoded raw user-file contents: one `username:bcrypt-hash[:totp-secret]` entry per line |
| `TINYAUTH_ADMIN_EMAIL` | Trusted email identity for the initial local `admin` account |
| `TINYAUTH_OIDC_CONFIG_BASE64` | Base64-encoded raw environment-variable file registering OIDC clients; schema below |

The initial account's password is stored separately as
`TINYAUTH_BOOTSTRAP_PASSWORD` in Infisical. This value is for the operator to
retrieve; it is not passed to the container. Only the encoded password-hash
list reaches the service. Base64 prevents bcrypt's dollar signs from being
interpolated by dotenv/Compose. The startup command decodes the user list and
client configuration into mode-0600 files in `/tmp`, which lives on tmpfs.
Client settings are imported as environment values without shell evaluation.
All Tinyauth settings use environment mode; a partial configuration file
would override the environment settings instead of merging with them.

Before the first deployment, create `/volume1/docker/tinyauth` with UID/GID
1000:1000 and mode 0700. Back up that directory, including the SQLite database
and `/data/oidc` signing keys, together with the Infisical configuration.

Traefik serves HTTPS on the configured hostname and reaches the internal
HTTP port 3000 through `homelab-proxy`. No host port is published. The service
uses only the existing proxy network, avoiding a new default Docker address
pool allocation. Only Traefik's exact address is trusted for forwarded client
headers. Tinyauth does not mount the Docker socket or use discovery labels.

This configuration is a standalone OIDC provider. Wildcard cookies are
disabled, so the login cookie stays on the auth hostname and is not shared
with other applications. Forward-auth middleware is a separate opt-in
configuration, not enabled by this stack. Telemetry and the optional
resources server are disabled.

## Register applications

Create a separate client for each application using Tinyauth's CLI:

```sh
tinyauth oidc create myapp
```

Run this privately and save the generated credentials in Infisical. Add a
client entry to the decoded OIDC configuration. Use a configuration key
containing only letters and digits, and raw values without shell quoting:

```text
TINYAUTH_OIDC_CLIENTS_MYAPP_CLIENTID=<generated-client-id>
TINYAUTH_OIDC_CLIENTS_MYAPP_CLIENTSECRET=<generated-client-secret>
TINYAUTH_OIDC_CLIENTS_MYAPP_TRUSTEDREDIRECTURIS=https://app.example.com/callback
TINYAUTH_OIDC_CLIENTS_MYAPP_NAME=My application
```

Store the base64-encoded configuration in `TINYAUTH_OIDC_CONFIG_BASE64`.
Keep all existing client entries when adding a new application. Configure
the application's matching client ID, secret, and issuer in its own
Infisical folder. Restart Tinyauth through Komodo after changing its runtime
configuration. These values belong in Infisical, not repository files.

The public issuer is `https://auth.malukzedan.synology.me`, with discovery at
`/.well-known/openid-configuration`. Applications sharing `homelab-proxy`
can reach the provider at `http://tinyauth:3000` if they support an internal
issuer override; the public HTTPS URL remains the token issuer.

Request `openid email profile`. Tinyauth includes `email_verified=true`
when the configured user has an email identity and the client requests the
`email` scope. The administrator is responsible for local email identities;
the provider does not send verification messages or consult Google.

After merge, verify the GitHub workflow, Komodo stack, container health,
trusted TLS, and the discovery endpoint. Application integrations and their
redirect URIs are configured independently.

## Accounts and updates

Add local accounts by creating bcrypt-hashed entries with Tinyauth's
`user create` CLI, updating the private user list in Infisical, and restarting
this stack through Komodo. Use raw hashes in the decoded user file, not
Compose-escaped `$$` hashes. Set per-user email attributes when an account
needs a specific email identity. Otherwise Tinyauth derives an email from the
username and domain. TOTP can be added as a third field in the user entry;
enroll its secret privately in an authenticator.

The OIDC subject is derived from username and client ID. Keep both stable
after applications store user data; changing either creates a different
identity in the application. Rotate client secrets in the provider and its
application together.

Tinyauth applies SQLite migrations on startup. Renovate automerges digest,
patch, and minor updates; major updates require review. Maintain consistent
data/configuration backups and take a fresh backup before merging a major
update. Retain the existing database, signing keys, and user list during
troubleshooting or rollback; do not delete the directory to reset a login
problem.
