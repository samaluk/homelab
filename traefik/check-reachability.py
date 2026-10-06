#!/usr/bin/env python3
"""Check the existing DSM hostname inventory with verified TLS and optional SNI routing."""
import argparse
import base64
import concurrent.futures
import http.client
import json
import os
import socket
import ssl
from pathlib import Path

HOSTS = """actual-ical-maluk actual-ics actual-tap-py actualtap bazarr bentopdf
budget changedetection dsm firefly freshrss home immich infisical jellyfin
komodo lidarr llm maintainerr minecraft miniflux ntfy opencode overseerr pihole
plex portainer prowlarr qbittorrent radarr reports resume seerr sonarr t3code
tautulli trek uptime-kuma wizarr""".split()
RETIRED = {"actual-ical-maluk", "actual-tap-py", "firefly", "freshrss",
           "minecraft", "opencode", "t3code"}
PATHS = {"actual-ics": "/healthcheck"}
WEBSOCKETS = {
    "home": "/api/websocket",
    "llm": "/ws/socket.io/?EIO=4&transport=websocket",
    "uptime-kuma": "/socket.io/?EIO=4&transport=websocket",
}


def check(name, args, websocket=False):
    host = f"{name}.{args.domain}"
    conn = http.client.HTTPSConnection(host, args.port, timeout=args.timeout,
                                       context=ssl.create_default_context())
    if args.connect:
        # Keep the URL hostname for TLS SNI and certificate verification.
        conn._create_connection = lambda address, timeout, source_address: (
            socket.create_connection((args.connect, args.port), timeout, source_address)
        )
    result = {"hostname": host, "kind": "websocket" if websocket else "http",
              "retired": name in RETIRED}
    headers = {"Host": host}
    if websocket:
        headers.update({"Connection": "Upgrade", "Upgrade": "websocket",
                        "Sec-WebSocket-Version": "13",
                        "Sec-WebSocket-Key": base64.b64encode(os.urandom(16)).decode()})
    try:
        conn.request("GET", WEBSOCKETS[name] if websocket else PATHS.get(name, "/"), headers=headers)
        response = conn.getresponse()
        result["status"] = response.status
        result["ok"] = (response.status == 101 if websocket else
                        200 <= response.status < 400 or response.status in (401, 403))
        # Checking headers avoids consuming large pages or endless streams.
    except (OSError, http.client.HTTPException) as exc:
        result.update(ok=False, error=str(exc))
    finally:
        conn.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", default="malukzedan.synology.me")
    parser.add_argument("--connect", help="Connect to this IP while retaining hostname/SNI")
    parser.add_argument("--port", type=int, default=443)
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--websockets", action="store_true")
    parser.add_argument("--output", type=Path, help="Save status-only JSON results")
    args = parser.parse_args()
    jobs = [(name, False) for name in HOSTS]
    if args.websockets:
        jobs += [(name, True) for name in WEBSOCKETS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda job: check(job[0], args, job[1]), jobs))
    for item in results:
        status = item.get("status", item.get("error"))
        label = "OK" if item["ok"] else "RETIRED" if item["retired"] else "FAIL"
        print(f"{label:7} {item['kind']:9} {item['hostname']} {status}")
    if args.output:
        args.output.write_text(json.dumps(results, indent=2) + "\n")
    failures = [item for item in results if not item["ok"] and not item["retired"]]
    print(f"{len(results)} checks, {len(failures)} failures on active routes")
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
