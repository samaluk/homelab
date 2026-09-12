# Sitebin

One [Sitebin](https://github.com/ittrail/sitebin.io) container for uploading and
sharing HTML reports, using its built-in UI, report passwords, and expiry.
The upload page is public. Each report has its own optional view password and
a generated edit password; there is no owner login.

## Deploy

Komodo stack `sitebin` tracks `homelab/main`, directory `sitebin`, using the
existing `env_template` unchanged. Only `compose.yaml` needs watching; no extra
config files or ignored services are needed. Store
`SITEBIN_HOST=reports.malukzedan.synology.me` in Infisical **prod /sitebin**.

DSM's existing reverse proxy routes HTTPS `reports.malukzedan.synology.me:443`
to HTTP `127.0.0.1:8090`, with the matching certificate and HSTS. Sitebin's
backend port is bound to NAS loopback. `SITEBIN_HTTP_ONLY=true` keeps Sitebin's
bundled Caddy listener on HTTP for that internal hop; DSM remains responsible
for public TLS termination. Komodo deploys after the PR reaches main.

The `/volume1/docker/sitebin` host directory is mounted at `/data` and holds
reports and signing keys. Before the first deploy, create it on the NAS with
the ownership expected by Sitebin's non-root UID/GID 1000:

```sh
sudo mkdir -p /volume1/docker/sitebin
sudo chown 1000:1000 /volume1/docker/sitebin
sudo chmod 0700 /volume1/docker/sitebin
```

Preserve and back up that directory. No named Docker volume or separate data
initializer is needed.

## Use

Open [reports](https://reports.malukzedan.synology.me), select a report named
`index.html` in **Web server** mode, then set **View password** and **Expires**
in **Options** before publishing. Both are optional in Sitebin: set them for
private, temporary reports. Save the claim ticket's edit URL and password
privately. Share only the view URL and view password.

In HTTP-only mode, Sitebin generates `http://` URLs even behind DSM HTTPS.
Change copied view and edit URLs to `https://` before using or sharing them.
Agents must make the same correction to API responses.

Agents can publish with `POST /api/sites` (multipart `files` named `index.html`,
`mode=webserver`, `view_password`, `expires_at`). Management uses the edit ID
from `edit_url` and `X-Edit-Password`; `PUT /api/sites/<edit-id>` changes password
or expiry, and `DELETE /api/sites/<edit-id>` revokes the report. Keep the original
report locally because expired content is eventually deleted.
