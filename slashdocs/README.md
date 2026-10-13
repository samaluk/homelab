# SlashDocs

[SlashDocs](https://github.com/razorpay/slashdocs) hosts self-contained HTML
documents with comments, immutable versions, and CLI/remote MCP publishing.
This stack runs the application, a dedicated Postgres 17 database, and
Versity's S3-compatible gateway with a persistent POSIX backend.

## Deploy

Create the Komodo stack `slashdocs` from `homelab/main`, directory `slashdocs`,
watching only `compose.yaml`. Use the shared Infisical pre-deploy hook and store
its runtime configuration in Infisical **prod /slashdocs**. Register the stack
and configuration before merging the PR so the normal GitHub workflow can
deploy it.

Required configuration:

| Variable | Value or purpose |
|----------|------------------|
| `SLASHDOCS_APP_HOST` | `docs.malukzedan.synology.me`, without scheme or path |
| `SLASHDOCS_RENDER_HOST` | `docs-render.malukzedan.synology.me`, without scheme or path |
| `SLASHDOCS_SUBNET` | `172.16.12.0/24`, verified unused in the current NAS networks and routes; recheck before changing |
| `POSTGRES_PASSWORD` | Random URL-safe database password; hexadecimal avoids DSN escaping |
| `BLOB_ACCESS_KEY_ID` | Unique access key for this stack's S3 gateway |
| `BLOB_SECRET_ACCESS_KEY` | Random S3 secret shared by the gateway and application |
| `SESSION_SECRET` | Random session-signing secret of at least 32 bytes |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth web application client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Matching OAuth client secret |

Use a Google OAuth **Web application** client with this exact redirect URI:

```text
https://docs.malukzedan.synology.me/v1/auth/google/callback
```

The consent app must be in **Production** to allow any Google account to sign
in. Testing mode limits sign-in to the configured test users. Request only
the standard OpenID Connect profile/email scopes; SlashDocs requires a verified
email. Documents start private. Explicit sharing can grant viewer, commenter,
or editor access to a person or everyone who can sign in. Everyone links still
require Google sign-in in v0.2.1; there is no anonymous viewer/commenter access
or built-in document expiry.

Traefik routes both hostnames to the application's internal HTTP port 8080
through `homelab-proxy`, with ACME TLS and HSTS. App and render hostnames must
differ to isolate uploaded HTML from authenticated sessions. No host ports
are published. Only the application joins `homelab-proxy`; the database and
S3 gateway remain on the stack's private internal network. An explicit unused
subnet avoids the NAS's nearly exhausted default Docker address pools.

Before the first deploy, create new persistent directories on the NAS:

```sh
sudo mkdir -p /volume1/docker/slashdocs/postgres /volume1/docker/slashdocs/blob
sudo chown 999:999 /volume1/docker/slashdocs/postgres
sudo chown 1000:1000 /volume1/docker/slashdocs/blob
sudo chmod 0700 /volume1/docker/slashdocs/postgres /volume1/docker/slashdocs/blob
```

The Debian Postgres image uses UID/GID 999. The application and S3 gateway run
as UID/GID 1000. The gateway creates the `slashdocs-documents` bucket directory
inside its bind mount. Do not reuse another stack's database or data paths.

## Verify and use

After merge, verify the GitHub deployment workflow, the Komodo stack, and all
three container healthchecks. `https://docs.malukzedan.synology.me/readyz`
checks dependency readiness. Verify trusted TLS on the render hostname too,
then sign in with Google and test an HTML upload, rendering, comments, and a
new version. JavaScript runs inside the isolated sandbox; test reports that
depend on browser storage, forms, downloads, or external APIs before moving
them.

The remote MCP endpoint is `https://docs.malukzedan.synology.me/mcp`. Interactive
clients use browser OAuth. For unattended agents, create a service account and
bearer key in the application, store the key privately, and grant the account
only the access it needs. Service-account/key creation is not an MCP tool.

CLI publishing uses:

```sh
slashdocs auth login https://docs.malukzedan.synology.me
SLASHDOCS_DEFAULT_DOC_PERMISSION=private slashdocs docs create report.html --title 'Report'
slashdocs docs push doc_123 report.html --summary 'Address review comments'
```

Keep reports as one self-contained HTML file (maximum 50 MiB), embedding local
images, CSS, and JavaScript where needed. Retain the original files and
document IDs locally. In v0.2.1, document list/search is capped at 25 without
pagination ([upstream issue #74](https://github.com/razorpay/slashdocs/issues/74)).
For all comments, omit the status filter rather than passing `all`, which
currently returns no results
([upstream issue #188](https://github.com/razorpay/slashdocs/issues/188)).

## Sitebin migration

Sitebin remains available at its existing hostname. Back up
`/volume1/docker/sitebin` before exporting content. Re-upload selected reports
as private SlashDocs documents, then grant intended recipients access. Keep a
private mapping of old report URLs to new document IDs. Existing links,
passwords, and expiry settings do not transfer automatically. Let temporary
reports expire in Sitebin unless a new retention policy is explicitly chosen.

## Backups and upgrades

Back up **both** the Postgres database (prefer `pg_dump` for a live database)
and `/volume1/docker/slashdocs/blob`; either alone is incomplete. Keep session,
database, S3, and OAuth credentials in Infisical. Restore a matching database
and blob backup into this stack's dedicated paths.

SlashDocs applies Postgres schema migrations at startup. Before application
updates, take paired backups and review upstream migration notes. Image
rollback alone may be insufficient: restore compatible database/blob backups
or apply documented down-migrations when necessary. Postgres major updates
are disabled in Renovate and require a separate migration plan. SlashDocs
version updates require review rather than automerge. Preserve all
data directories during troubleshooting and rollback.
