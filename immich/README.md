# Immich external libraries

The Immich server receives SwingVault's published clips through a dedicated
read-only external-library bind. It does not receive access to SwingVault's
canonical root, the iCloud archive, or Immich's managed upload tree.

## SwingVault published library

Create the host directory before deploying the compose change. Run these
commands on the Synology host as an administrator, and preserve any existing
files:

~~~sh
sudo mkdir -p /volume1/SMaluk/swingvault/published
sudo chown 1026:100 /volume1/SMaluk/swingvault/published
sudo chmod 755 /volume1/SMaluk/swingvault/published
~~~

The compose file defaults SWINGVAULT_PUBLISHED_PATH to
/volume1/SMaluk/swingvault/published. Set that stack variable in Komodo or
Infisical only when the deployment uses a different, pre-created host path.
Inside the container, SwingVault's published tree is always
/data/swingvault/published; configure that exact path as a read-only Immich
external library.

Before applying the stack change, render the stack with the normal deployment
environment:

~~~sh
docker compose -f immich/compose.yaml --env-file /path/to/immich.env config --quiet
~~~

In Immich, create one external library named SwingVault with import path
/data/swingvault/published. Confirm its owner and scan permissions match the
least-privilege API key used by the Mac worker. The first scan is an operator
action after the SwingVault worker has published a verified clip.

## Rollback

Stop or roll back the Immich stack through Komodo after the change has been
merged. Restoring the previous immich/compose.yaml removes the bind on the
next deploy; it does not remove /volume1/SMaluk/swingvault/published or any
Immich-managed data. Leave the published directory in place so a later
deployment can reattach the same external library without changing canonical
SwingVault data.
