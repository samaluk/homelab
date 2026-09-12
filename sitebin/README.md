# Private report hosting

[Sitebin](https://github.com/ittrail/sitebin.io) stores self-contained HTML reports
on the NAS. The Folio upload page provides drag-and-drop publishing, a generated
viewer password, and a seven-day default expiry. A small nginx gateway protects
publishing and management with an owner login. No database is needed.

## Komodo and Infisical

Create the `sitebin` stack from Komodo's existing `env_template`. Keep its
Infisical pre-deploy command unchanged. Use the linked `homelab` repository,
branch `main`, run directory `sitebin`, and `compose.yaml`. Remove the template
exclusion tag from the new stack, and ignore the completed `init-data` service.

Register these config files with `requires: Redeploy`, service `gateway`:

- `gateway/start.sh`
- `gateway/nginx.conf.template`
- `gateway/headers.conf`
- `web/index.html`
- `web/drop.css`
- `web/drop.js`

The existing GitHub workflow selects this stack after changes to those files or
its Compose file reach `main`. Documentation-only changes do not redeploy it.
There is no separate Infisical Agent, export hook, or deployment workflow.

Store settings in Infisical's `prod` environment, folder `/sitebin`:

| Setting | Value / purpose |
|---------|-----------------|
| `SITEBIN_HOST` | `reports.malukzedan.synology.me`, without scheme, port, or path |
| `SITEBIN_OWNER_PASSWORD` | Random owner login password; username is `owner` |
| `SITEBIN_OWNER_HTPASSWD_B64` | Base64 encoding of `owner:<bcrypt hash of the owner password>` |

The base64 wrapper preserves bcrypt's dollar signs through the template's normal
Infisical export and Compose interpolation. It is encoding, not encryption.
The gateway receives only the encoded hash; it decodes it into a mode-0600 file
in its temporary filesystem. The plaintext owner password stays in Infisical
and the template's restricted environment file, outside container environments.
Rotate both password settings together and redeploy through Komodo.

## HTTPS on Synology

In DSM's reverse proxy, add:

| Field | Setting |
|-------|---------|
| Name | Private reports |
| Source | HTTPS, `reports.malukzedan.synology.me`, port `443` |
| Destination | HTTP, `127.0.0.1`, port `8090` |
| TLS | Assign a certificate covering the report hostname; enable HSTS |
| HTTP version / timeout | HTTP/1.1, 60 seconds |

Ensure DNS resolves the report hostname to the NAS's public endpoint. No new
router port is needed when the existing HTTPS reverse proxy is already exposed.
Keep DSM caching disabled for this route. The stack publishes its gateway only
on NAS loopback; the Sitebin backend has no published port.

After the PR merges and Komodo deploys, verify the public HTTPS URL from a device
outside the LAN. `/` should request the owner login. Upload synthetic HTML, open
its view link in a fresh browser, unlock it with the viewer password, and confirm
expiry blocks an already-unlocked session. Do this before uploading financial
reports. The gateway corrects Sitebin's HTTP-only metadata links and marks view
cookies Secure, HttpOnly, and SameSite=Lax.

## Publishing and sharing

Open the portal, choose one self-contained `.html` file (up to 8 MB), choose its
lifetime, and publish. Save the private receipt before leaving the page. Share
the **view link and viewer password**. Keep the receipt's management link and
edit password private; management also requires the owner login.

For agents, use Sitebin's API through the HTTPS gateway with owner Basic auth:

- `POST /api/sites`: multipart `files` named `index.html`, `mode=webserver`,
  **nonempty `view_password`**, and an optional ISO-8601 `expires_at`. Always set
  a viewer password for private reports. The owner API supports unprotected
  uploads, so agents must preserve this publishing policy.
- Save the returned `view_url`, `edit_url`, `edit_password`, and expiry in a
  restricted local receipt. Do not print credentials into chat or logs.
- `PUT /api/sites/<edit-id>` with owner auth and `X-Edit-Password`: update
  `expires_at` or `view_password`. JSON `expires_at: null` removes expiry.
- `DELETE /api/sites/<edit-id>` with both credentials revokes the report.

The edit ID comes from the last segment of `edit_url`; it differs from the view
ID. A view link can be opened from a phone or a ChatGPT conversation without
access to the computer that generated the report. Expiry controls future server
access; preserve the original report locally. Sitebin cleans up expired content
after a grace period, so this service is not the report archive.

Uploaded reports run in a browser sandbox with inline JavaScript and styles,
printing, and downloads allowed. They cannot access the owner's origin, make
network requests, embed frames, or submit forms. Reports must embed their assets;
remote fonts, scripts, and API-backed widgets will not work. Management pages
and password forms remain outside that sandbox. Responses use no-store caching,
no-referrer, and no-index headers; gateway access logs are disabled.

## Storage and recovery

`/volume1/docker/sitebin` contains Sitebin data and signing keys. The one-shot
`init-data` service sets the top directory to UID/GID 1000 and mode 0700 without
recursively changing existing contents. Preserve that directory, ownership, and
keys across image updates. Include it in the NAS backup policy if reports need
recovery. Restoring content can also restore an earlier expiry/password state.

Sitebin follows its `latest` image channel pinned to a multi-platform digest;
Renovate updates the digest. Both the service and initializer use the same image.
nginx has a versioned tag and digest. The backend memory limit is 384 MB, with a
192 MiB Go memory target; the gateway is limited to 64 MB. Neither is a platform
manager such as Coolify or Dokploy.

## Validation

```sh
bun install --frozen-lockfile
bunx dclint . -r -c .dclintrc
docker compose --env-file /path/to/private/sitebin.env -f sitebin/compose.yaml config --quiet
```

`tests/access.test.ts` exercises owner authentication, browser-origin checks,
HTTPS links, scoped Secure cookies, report sandboxing, no-store responses,
password rotation, expiry with an existing session, renewal, and deletion.
Run it **only against an isolated local test stack**, with synthetic reports:

```sh
# Inject these variables through your credential tooling; do not paste passwords.
# SITEBIN_TEST_URL=http://127.0.0.1:<local-test-port>
# SITEBIN_TEST_OWNER_PASSWORD=<test-stack owner password>
bun test sitebin/tests/access.test.ts
```

The integration tests skip when those variables are absent. For local testing,
override the NAS data bind with a temporary directory, use distinct container
names and a loopback port, and remove that test stack after verification. Browser
checks should also cover a 390-pixel viewport and the password-gated report flow.
